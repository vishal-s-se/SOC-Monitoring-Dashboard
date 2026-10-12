import { useState, useEffect } from "react";
import Link from "next/link";
import { SeverityBadge } from "./SeverityBadge";
import { StatusBadge } from "./StatusBadge";
import { AddToInvestigationModal } from "./AddToInvestigationModal";
import { api } from "@/lib/api";

export function EventDetailsModal({ event, onClose }: { event: any, onClose: () => void }) {
  const [showInvestigateModal, setShowInvestigateModal] = useState(false);
  const [context, setContext] = useState<any | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [metaCopied, setMetaCopied] = useState(false);

  useEffect(() => {
    if (!event || !showContext) return;
    setContextLoading(true);
    async function loadContext() {
      try {
        const data = await api.get<any>(`/events/${encodeURIComponent(event.event_id)}/context`);
        setContext(data);
      } catch {
        setContext(null);
      } finally {
        setContextLoading(false);
      }
    }
    loadContext();
  }, [event, showContext]);

  if (!event) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/70 backdrop-blur-sm p-3 sm:p-4 md:p-6">
      <div 
        className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col overflow-hidden min-w-0 max-h-[90vh]"
        style={{ width: 'min(75vw, 1400px)', minWidth: 'min(100%, 360px)' }}
      >
        {/* Header - Responsive Grid Layout */}
        <div className="p-4 sm:p-5 border-b border-gray-800 bg-gray-900 sticky top-0 z-10 min-w-0">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 items-start min-w-0">
            {/* Left Section: Title and Event Identifier */}
            <div className="min-w-0 flex flex-col gap-1.5">
              <h3 className="text-lg font-semibold text-white tracking-tight shrink-0">
                Event Details
              </h3>
              {event.event_id && (
                <div className="flex items-start gap-1.5 text-xs text-gray-400 min-w-0 bg-gray-800/80 px-2.5 py-1.5 rounded border border-gray-700/60">
                  <span className="text-gray-500 font-semibold shrink-0 mt-0.5">ID:</span>
                  <span 
                    className="font-mono text-gray-300 break-all select-all flex-1 min-w-0"
                    style={{ overflowWrap: 'anywhere' }}
                    title={event.event_id}
                  >
                    {event.event_id}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(event.event_id);
                      setIdCopied(true);
                      setTimeout(() => setIdCopied(false), 2000);
                    }}
                    className="text-gray-400 hover:text-white p-0.5 shrink-0 transition-colors rounded hover:bg-gray-700"
                    title="Copy Event ID"
                  >
                    {idCopied ? (
                      <span className="text-[10px] text-green-400 font-medium">Copied!</span>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth="2"></rect>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2"></path>
                      </svg>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Right Section: Actions and Close */}
            <div className="flex items-center flex-wrap gap-2 shrink-0 justify-start md:justify-end">
              <button
                type="button"
                onClick={() => setShowInvestigateModal(true)}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-2.5 py-1.5 rounded transition-colors inline-flex items-center gap-1 shadow-sm whitespace-nowrap"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                <span>Add to Investigation</span>
              </button>
              <a
                href={`/attack-timeline?search=${encodeURIComponent(event.event_id || '')}`}
                onClick={onClose}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-2.5 py-1.5 rounded transition-colors inline-flex items-center gap-1 shadow-sm whitespace-nowrap"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>View in Timeline</span>
              </a>
              <button
                type="button"
                onClick={() => setShowContext(v => !v)}
                className={`text-xs font-medium px-2.5 py-1.5 rounded transition-colors inline-flex items-center gap-1 whitespace-nowrap ${showContext ? 'bg-purple-700 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
              >
                <span>{showContext ? 'Hide Context' : 'Observed Context'}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                title="Close modal"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto overflow-x-hidden space-y-6 flex-1 min-w-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="min-w-0">
              <p className="text-xs text-gray-500 uppercase">Timestamp</p>
              <p className="text-sm text-gray-200 font-medium truncate" title={new Date(event.timestamp).toLocaleString()}>{new Date(event.timestamp).toLocaleString()}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 uppercase">Severity</p>
              <div className="mt-1"><SeverityBadge severity={event.severity || 'INFO'} /></div>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 uppercase">Host</p>
              {event.hostname ? (
                <Link
                  href={`/host-investigation?host=${encodeURIComponent(event.hostname)}`}
                  onClick={onClose}
                  className="text-sm text-blue-400 hover:text-blue-300 hover:underline font-medium truncate block"
                  title={event.hostname}
                >
                  {event.hostname}
                </Link>
              ) : (
                <p className="text-sm text-gray-200 font-medium">N/A</p>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 uppercase">Agent ID</p>
              <p className="text-sm text-gray-200 font-medium truncate">{event.agent_id || 'N/A'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase">Event Type</p>
              <p className="text-sm text-gray-200">{event.event_type || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Category</p>
              <p className="text-sm text-gray-200">{event.event_category || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Source / Channel</p>
              <p className="text-sm text-gray-200">{event.source_type || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">User</p>
              {event.username ? (
                <Link
                  href={`/user-context?user=${encodeURIComponent(event.username)}`}
                  onClick={onClose}
                  className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
                >
                  {event.username}
                </Link>
              ) : (
                <p className="text-sm text-gray-200">N/A</p>
              )}
            </div>
          </div>

          {(event.source_ip || event.destination_ip || event.action || event.protocol) && (
            <div className="border-t border-gray-800 pt-4">
              <h4 className="text-sm font-semibold text-gray-300 mb-3">Network &amp; Action</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Source IP</p>
                  {event.source_ip ? (
                    <Link
                      href={`/ip-investigation?ip=${encodeURIComponent(event.source_ip)}`}
                      onClick={onClose}
                      className="text-sm text-blue-400 hover:text-blue-300 hover:underline font-mono"
                    >
                      {event.source_ip}
                    </Link>
                  ) : (
                    <p className="text-sm text-gray-400">N/A</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Source Port</p>
                  <p className="text-sm text-gray-200">{event.source_port || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Destination IP</p>
                  {event.destination_ip ? (
                    <Link
                      href={`/ip-investigation?ip=${encodeURIComponent(event.destination_ip)}`}
                      onClick={onClose}
                      className="text-sm text-blue-400 hover:text-blue-300 hover:underline font-mono"
                    >
                      {event.destination_ip}
                    </Link>
                  ) : (
                    <p className="text-sm text-gray-400">N/A</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Destination Port</p>
                  <p className="text-sm text-gray-200">{event.destination_port || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Protocol</p>
                  <p className="text-sm text-gray-200">{event.protocol || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Action</p>
                  <p className="text-sm text-gray-200">{event.action || 'N/A'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Observed Context Panel */}
          {showContext && (
            <div className="border-t border-purple-800/60 pt-4 space-y-4">
              <h4 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
                <span>Observed Context</span>
                {contextLoading && <span className="text-xs text-gray-400 animate-pulse">Loading...</span>}
              </h4>

              {!contextLoading && context && (
                <>
                  {/* Alerts */}
                  {context.alerts && context.alerts.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase mb-2">Associated Alerts ({context.alerts.length})</p>
                      <div className="space-y-1">
                        {context.alerts.map((a: any) => (
                          <div key={a.id} className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
                            <div className="flex items-center gap-2">
                              <SeverityBadge severity={a.severity} />
                              <span className="text-sm text-white">{a.title}</span>
                              {a.rule_name && <span className="text-xs text-gray-400">via {a.rule_name}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status={a.status} />
                              <Link
                                href={`/attack-timeline?alert_id=${a.id}`}
                                onClick={onClose}
                                className="text-xs text-indigo-400 hover:underline"
                              >
                                Timeline
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Investigations */}
                  {context.investigations && context.investigations.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase mb-2">Linked Investigations ({context.investigations.length})</p>
                      <div className="space-y-1">
                        {context.investigations.map((i: any) => (
                          <div key={i.id} className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
                            <Link
                              href={`/investigations/${i.id}`}
                              onClick={onClose}
                              className="text-sm text-blue-400 hover:underline"
                            >
                              {i.title}
                            </Link>
                            <div className="flex items-center gap-2">
                              <SeverityBadge severity={i.severity} />
                              <StatusBadge status={i.status} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* MITRE */}
                  {context.mitre_techniques && context.mitre_techniques.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase mb-2">MITRE ATT&CK ({context.mitre_techniques.length})</p>
                      <div className="space-y-1">
                        {context.mitre_techniques.map((m: any) => (
                          <div key={m.technique_id} className="flex items-center gap-3 bg-gray-800 rounded px-3 py-2">
                            <span className="font-mono text-xs font-bold text-red-300 bg-red-950/60 border border-red-800/50 px-1.5 py-0.5 rounded">{m.technique_id}</span>
                            <span className="text-sm text-white">{m.name}</span>
                            {m.tactics && m.tactics.length > 0 && (
                              <span className="text-xs text-blue-300">({m.tactics.map((t: any) => t.name).join(', ')})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Nearby Events */}
                  {context.nearby_events && context.nearby_events.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase mb-2">Nearby Events on Same Host (±15 min, {context.nearby_events.length})</p>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {context.nearby_events.map((ne: any) => (
                          <div key={ne.id} className="flex items-center justify-between bg-gray-800/60 rounded px-3 py-1.5 text-xs">
                            <span className="text-gray-400">{new Date(ne.timestamp).toLocaleTimeString()}</span>
                            <span className="text-gray-200">{ne.event_type || ne.event_category}</span>
                            {ne.username && <span className="text-gray-400">{ne.username}</span>}
                            <SeverityBadge severity={ne.severity || 'INFO'} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {context.alerts?.length === 0 && context.investigations?.length === 0 && context.mitre_techniques?.length === 0 && context.nearby_events?.length === 0 && (
                    <p className="text-sm text-gray-500 italic">No related alerts, investigations, MITRE mappings, or nearby events found for this event.</p>
                  )}
                </>
              )}
            </div>
          )}

          {event.metadata_ && Object.keys(event.metadata_).length > 0 && (
            <div className="border-t border-gray-800 pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-300">Metadata Payload</h4>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(event.metadata_, null, 2));
                    setMetaCopied(true);
                    setTimeout(() => setMetaCopied(false), 2000);
                  }}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-2.5 py-1 rounded transition-colors inline-flex items-center gap-1.5"
                >
                  {metaCopied ? (
                    <span className="text-green-400 font-medium">Copied!</span>
                  ) : (
                    <span>Copy Metadata</span>
                  )}
                </button>
              </div>
              <div className="bg-gray-950 p-4 rounded border border-gray-800 overflow-hidden">
                <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all sm:break-words overflow-auto max-h-60">
                  {JSON.stringify(event.metadata_, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {showInvestigateModal && (
        <AddToInvestigationModal
          evidenceType="EVENT"
          referenceId={event.event_id}
          defaultTitle={`Investigation: ${event.event_type}`}
          onClose={() => setShowInvestigateModal(false)}
        />
      )}
    </div>
  );
}
