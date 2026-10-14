import logging
import time
import json
import uuid
from datetime import datetime, timezone
from shared.envelope import create_envelope

logger = logging.getLogger(__name__)

try:
    import win32evtlog
    import win32event
    import win32con
    import xml.etree.ElementTree as ET
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False
    logger.debug("win32evtlog not available (expected on non-Windows test hosts)")

class WindowsEventLogCollector:
    # Channels that are standard vs optional add-ons on Windows systems
    OPTIONAL_CHANNELS = {
        "Microsoft-Windows-Sysmon/Operational",
        "Microsoft-Windows-Windows Defender/Operational",
        "Microsoft-Windows-PowerShell/Operational",
    }

    def __init__(self, channels, state_manager, transport, identity):
        self.channels = channels
        self.state_manager = state_manager
        self.transport = transport
        self.identity = identity
        self.handles = {}
        self.unavailable_channels = set()
        self._warned_channels = set()
        
    def setup(self):
        if not HAS_WIN32:
            logger.warning("win32evtlog not available, Windows collection disabled.")
            return False
            
        for channel in self.channels:
            try:
                # We use EvtSubscribe for better modern event log collection if possible,
                # or fallback to old event log. Actually we can use the winevt APIs through win32evtlog.
                # Since EvtQuery is available in modern pywin32:
                logger.info(f"Setting up collection for channel: {channel}")
            except Exception as e:
                logger.error(f"Failed to setup channel {channel}: {e}")
                
        return True
        
    def _parse_event_xml(self, xml_str):
        event_dict = {}
        try:
            root = ET.fromstring(xml_str)
            ns = "{http://schemas.microsoft.com/win/2004/08/events/event}"
            
            # System properties
            system = root.find(f"{ns}System")
            if system is not None:
                event_dict["Provider"] = system.find(f"{ns}Provider").attrib.get("Name") if system.find(f"{ns}Provider") is not None else None
                event_dict["EventID"] = int(system.find(f"{ns}EventID").text) if system.find(f"{ns}EventID") is not None else None
                event_dict["Level"] = system.find(f"{ns}Level").text if system.find(f"{ns}Level") is not None else None
                event_dict["Task"] = system.find(f"{ns}Task").text if system.find(f"{ns}Task") is not None else None
                event_dict["Keywords"] = system.find(f"{ns}Keywords").text if system.find(f"{ns}Keywords") is not None else None
                
                time_created = system.find(f"{ns}TimeCreated")
                if time_created is not None:
                    event_dict["SystemTime"] = time_created.attrib.get("SystemTime")
                event_dict["EventRecordID"] = system.find(f"{ns}EventRecordID").text if system.find(f"{ns}EventRecordID") is not None else None
                event_dict["Channel"] = system.find(f"{ns}Channel").text if system.find(f"{ns}Channel") is not None else None
                event_dict["Computer"] = system.find(f"{ns}Computer").text if system.find(f"{ns}Computer") is not None else None
            
            # Event Data
            event_data = root.find(f"{ns}EventData")
            data_dict = {}
            if event_data is not None:
                for data in event_data.findall(f"{ns}Data"):
                    name = data.attrib.get("Name")
                    if name:
                        data_dict[name] = data.text
            
            if data_dict:
                event_dict["EventData"] = data_dict
                
        except Exception as e:
            logger.debug(f"Failed to parse event XML: {e}")
            event_dict["RawXML"] = xml_str
            
        return event_dict

    def collect_channel(self, channel):
        if not HAS_WIN32:
            return 0
            
        if channel in self.unavailable_channels:
            return 0

        state_key = f"win_evt_{channel}"
        state = self.state_manager.get_state(state_key, default={"bookmark": None})
        
        events_collected = 0
        
        try:
            flags = win32evtlog.EvtQueryChannelPath
            # We want to start from bookmark if it exists, otherwise from newest/oldest?
            # For this Phase 4A implementation, we'll demonstrate using EvtQuery
            # In a real heavy implementation, EvtSubscribe is better.
            
            query = "*"
            query_handle = win32evtlog.EvtQuery(channel, flags, query)
            
            # Seek to bookmark
            if state.get("bookmark"):
                try:
                    bookmark = win32evtlog.EvtCreateBookmark(state["bookmark"])
                    win32evtlog.EvtSeek(query_handle, 1, win32evtlog.EvtSeekRelativeToBookmark, bookmark)
                except Exception as e:
                    logger.warning(f"Failed to seek to bookmark for {channel}: {e}, falling back to recent events")
                    # Fallback seek to end or just collect newest
                    win32evtlog.EvtSeek(query_handle, 0, win32evtlog.EvtSeekRelativeToLast)
            else:
                # If no bookmark, collect recent? For now, seek to end so we don't dump 100k events.
                win32evtlog.EvtSeek(query_handle, 0, win32evtlog.EvtSeekRelativeToLast)

            while True:
                events = win32evtlog.EvtNext(query_handle, 10)
                if not events:
                    break
                    
                for event in events:
                    xml_str = win32evtlog.EvtRender(event, win32evtlog.EvtRenderEventXml)
                    parsed_event = self._parse_event_xml(xml_str)
                    parsed_event["RawXML"] = xml_str
                    
                    event_record_id = parsed_event.get("EventRecordID")
                    event_id = parsed_event.get("EventID")
                    
                    # Envelope
                    dedup_id = f"{channel}-{event_record_id}" if event_record_id else str(uuid.uuid4())
                    timestamp = parsed_event.get("SystemTime")
                    
                    envelope = create_envelope(
                        identity=self.identity,
                        event_type=f"windows_event_{event_id}",
                        source=f"windows_{channel}",
                        payload=parsed_event,
                        event_id=dedup_id,
                        timestamp=timestamp
                    )
                    
                    # Queue event
                    self.transport.send_event(envelope)
                    events_collected += 1
                    
                    # Update bookmark
                    bookmark_handle = win32evtlog.EvtCreateBookmark(None)
                    win32evtlog.EvtUpdateBookmark(bookmark_handle, event)
                    new_bookmark_xml = win32evtlog.EvtRender(bookmark_handle, win32evtlog.EvtRenderBookmark)
                    state["bookmark"] = new_bookmark_xml
                    
                # Save state incrementally
                self.state_manager.set_state(state_key, state)
                    
        except Exception as e:
            # Check for missing channel error (WinError 15007: ERROR_EVT_CHANNEL_NOT_FOUND)
            win_error_code = None
            if hasattr(e, "winerror"):
                win_error_code = e.winerror
            elif hasattr(e, "args") and len(e.args) > 0 and isinstance(e.args[0], int):
                win_error_code = e.args[0]

            is_missing_channel = win_error_code == 15007 or any(
                phrase in str(e).lower()
                for phrase in ("the specified channel could not be found", "15007", "channel not found")
            )

            is_perm_error = win_error_code == 5 or any(
                phrase in str(e).lower()
                for phrase in ("access is denied", "permission denied")
            )

            if is_missing_channel:
                is_optional = channel in self.OPTIONAL_CHANNELS
                self.unavailable_channels.add(channel)
                if channel not in self._warned_channels:
                    self._warned_channels.add(channel)
                    if is_optional:
                        logger.warning(
                            f"Optional Windows Event channel '{channel}' is not installed or enabled on this host; skipping."
                        )
                    else:
                        logger.warning(
                            f"Windows Event channel '{channel}' was not found on this host; skipping: {e}"
                        )
            elif is_perm_error:
                logger.error(f"Permission denied collecting from Windows Event channel '{channel}': {e}")
            else:
                logger.error(f"Error collecting from channel {channel}: {e}")
            
        return events_collected

    def collect(self):
        total = 0
        for channel in self.channels:
            total += self.collect_channel(channel)
        return total
