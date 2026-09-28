"use client"

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTable } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { EventDetailsModal } from '@/components/ui/EventDetailsModal'
import { AlertDetailsModal } from '@/components/ui/AlertDetailsModal'
import { MitreTechniqueDetailsModal } from '@/components/ui/MitreTechniqueDetailsModal'
import { useWebSocket } from '@/hooks/useWebSocket'

type TimePreset = '1h' | '24h' | '7d' | 'all' | 'custom'

function IpInvestigationContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const ipParam = searchParams.get('ip') || ''
  const roleParam = (searchParams.get('role') as 'all' | 'source' | 'destination') || 'all'
  const timePresetParam = (searchParams.get('time_preset') as TimePreset) || 'all'

  const [inputIp, setInputIp] = useState(ipParam)
  const [activeIp, setActiveIp] = useState(ipParam)
  const [activeRole, setActiveRole] = useState<'all' | 'source' | 'destination'>(roleParam)
  const [timePreset, setTimePreset] = useState<TimePreset>(timePresetParam)
  const [customStart, setCustomStart] = useState(searchParams.get('start_time') || '')
  const [customEnd, setCustomEnd] = useState(searchParams.get('end_time') || '')

  // Data states
  const [overview, setOverview] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Sub-tabs
  const [activeTab, setActiveTab] = useState<'events' | 'alerts' | 'hosts' | 'agents' | 'users' | 'investigations' | 'mitre'>('events')

  // Events table state
  const [events, setEvents] = useState<any[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsPage, setEventsPage] = useState(1)
  const [eventsTotal, setEventsTotal] = useState(0)
  const [eventCategoryFilter, setEventCategoryFilter] = useState('')
  const [eventProtocolFilter, setEventProtocolFilter] = useState('')
  const [eventSearch, setEventSearch] = useState('')

  // Alerts table state
  const [alerts, setAlerts] = useState<any[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsPage, setAlertsPage] = useState(1)
  const [alertsTotal, setAlertsTotal] = useState(0)

  // Modals
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)
  const [selectedAlert, setSelectedAlert] = useState<any | null>(null)
  const [selectedMitre, setSelectedMitre] = useState<any | null>(null)

  const { lastMessage } = useWebSocket()

  // Calculate time bounds based on preset
  const calculateTimeBounds = useCallback((): { start?: string; end?: string } => {
    if (timePreset === 'all') return {}
    if (timePreset === 'custom') {
      return {
        start: customStart ? new Date(customStart).toISOString() : undefined,
        end: customEnd ? new Date(customEnd).toISOString() : undefined
      }
    }
    const now = new Date()
    const minutesMap: Record<string, number> = {
      '1h': 60,
      '24h': 1440,
      '7d': 10080
    }
    const mins = minutesMap[timePreset] || 1440
    const start = new Date(now.getTime() - mins * 60 * 1000)
    return {
      start: start.toISOString(),
      end: now.toISOString()
    }
  }, [timePreset, customStart, customEnd])

  // Sync URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (activeIp) params.set('ip', activeIp)
    if (activeRole !== 'all') params.set('role', activeRole)
    if (timePreset !== 'all') params.set('time_preset', timePreset)
    if (customStart) params.set('start_time', customStart)
    if (customEnd) params.set('end_time', customEnd)

    const qs = params.toString()
    const newUrl = qs ? `/ip-investigation?${qs}` : '/ip-investigation'
    window.history.replaceState(null, '', newUrl)
  }, [activeIp, activeRole, timePreset, customStart, customEnd])

  // Fetch IP Overview
  const fetchOverview = useCallback(async (targetIp: string) => {
    if (!targetIp.trim()) {
      setOverview(null)
      setError('')
      return
    }
    try {
      setLoading(true)
      setError('')
      const bounds = calculateTimeBounds()
      const query: Record<string, any> = {}
      if (activeRole !== 'all') query.role = activeRole
      if (bounds.start) query.start_time = bounds.start
      if (bounds.end) query.end_time = bounds.end

      const res = await api.get<any>(`/ip-investigation/${encodeURIComponent(targetIp.trim())}`, query)
      setOverview(res)
    } catch (err: any) {
      setError(err.message || 'Failed to load IP investigation')
      setOverview(null)
    } finally {
      setLoading(false)
    }
  }, [activeRole, calculateTimeBounds])

  // Fetch Events for the IP
  const fetchEvents = useCallback(async (targetIp: string) => {
    if (!targetIp.trim()) {
      setEvents([])
      setEventsTotal(0)
      return
    }
    try {
      setEventsLoading(true)
      const bounds = calculateTimeBounds()
      const query: Record<string, any> = {
        page: eventsPage,
        page_size: 50
      }
      if (activeRole !== 'all') query.role = activeRole
      if (eventCategoryFilter.trim()) query.event_category = eventCategoryFilter.trim()
      if (eventProtocolFilter.trim()) query.protocol = eventProtocolFilter.trim()
      if (eventSearch.trim()) query.search = eventSearch.trim()
      if (bounds.start) query.start_time = bounds.start
      if (bounds.end) query.end_time = bounds.end

      const res = await api.get<any>(`/ip-investigation/${encodeURIComponent(targetIp.trim())}/events`, query)
      setEvents(res.items || [])
      setEventsTotal(res.total || 0)
    } catch {
      setEvents([])
      setEventsTotal(0)
    } finally {
      setEventsLoading(false)
    }
  }, [activeRole, eventsPage, eventCategoryFilter, eventProtocolFilter, eventSearch, calculateTimeBounds])

  // Fetch Alerts for the IP
  const fetchAlerts = useCallback(async (targetIp: string) => {
    if (!targetIp.trim()) {
      setAlerts([])
      setAlertsTotal(0)
      return
    }
    try {
      setAlertsLoading(true)
      const res = await api.get<any>(`/ip-investigation/${encodeURIComponent(targetIp.trim())}/alerts`, {
        page: alertsPage,
        page_size: 50
      })
      setAlerts(res.items || [])
      setAlertsTotal(res.total || 0)
    } catch {
      setAlerts([])
      setAlertsTotal(0)
    } finally {
      setAlertsLoading(false)
    }
  }, [alertsPage])

  // Trigger loading when activeIp or filters change
  useEffect(() => {
    if (activeIp) {
      fetchOverview(activeIp)
      fetchEvents(activeIp)
      fetchAlerts(activeIp)
    }
  }, [activeIp, fetchOverview, fetchEvents, fetchAlerts])

  // WebSocket real-time updates: only refresh if the event references our active IP
  useEffect(() => {
    if (!lastMessage || !activeIp) return
    if (lastMessage.type === 'new_event') {
      const ev = lastMessage.data
      if (ev && (ev.source_ip === activeIp || ev.destination_ip === activeIp)) {
        fetchOverview(activeIp)
        if (eventsPage === 1) {
          fetchEvents(activeIp)
        }
      }
    } else if (lastMessage.type === 'new_alert' || lastMessage.type === 'alert_updated') {
      fetchOverview(activeIp)
      fetchAlerts(activeIp)
    }
  }, [lastMessage, activeIp, eventsPage, fetchOverview, fetchEvents, fetchAlerts])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputIp.trim()) {
      setActiveIp(inputIp.trim())
      setEventsPage(1)
      setAlertsPage(1)
    }
  }

  const summary = overview?.summary

  return (
    <div className="space-y-6">
      {/* Header and Query Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-3">
            <span>IP Investigation</span>
            {summary && (
              <span className="text-xs px-2.5 py-1 rounded bg-blue-950/60 text-blue-400 border border-blue-800 font-mono">
                {summary.ip_version} • {summary.address_scope.toUpperCase()}
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Telemetry evidence investigation for observed source and destination addresses
          </p>
        </div>

        {/* Global IP Search Input */}
        <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2 w-full md:w-auto">
          <input
            type="text"
            value={inputIp}
            onChange={(e) => setInputIp(e.target.value)}
            placeholder="Enter IPv4 or IPv6 address..."
            className="bg-[#151518] border border-gray-800 focus:border-blue-500 rounded px-3 py-2 text-sm text-white font-mono placeholder-gray-500 w-full md:w-80 focus:outline-none"
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-semibold transition-colors shrink-0"
          >
            Investigate
          </button>
        </form>
      </div>

      {/* Filter and Control Bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Role Filter Buttons */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-400 font-semibold mr-1">Observed Role:</span>
              <div className="inline-flex rounded-lg bg-gray-900 p-0.5 border border-gray-800">
                <button
                  onClick={() => { setActiveRole('all'); setEventsPage(1); }}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    activeRole === 'all' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  All Observed ({summary?.total_events || 0})
                </button>
                <button
                  onClick={() => { setActiveRole('source'); setEventsPage(1); }}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    activeRole === 'source' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Source ({summary?.source_events_count || 0})
                </button>
                <button
                  onClick={() => { setActiveRole('destination'); setEventsPage(1); }}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    activeRole === 'destination' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Destination ({summary?.destination_events_count || 0})
                </button>
              </div>
            </div>

            {/* Time Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-gray-400 font-semibold mr-1">Time Window:</span>
              {(['1h', '24h', '7d', 'all', 'custom'] as TimePreset[]).map((preset) => (
                <button
                  key={preset}
                  onClick={() => { setTimePreset(preset); setEventsPage(1); }}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    timePreset === preset
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-800'
                  }`}
                >
                  {preset.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Attack Timeline Navigation Link */}
            {activeIp && (
              <div>
                <Link
                  href={`/attack-timeline?search=${encodeURIComponent(activeIp)}`}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors inline-flex items-center space-x-1.5"
                >
                  <span>Open in Attack Timeline →</span>
                </Link>
              </div>
            )}
          </div>

          {timePreset === 'custom' && (
            <div className="flex items-center space-x-4 pt-2 border-t border-gray-800 text-xs">
              <div className="flex items-center space-x-2">
                <span className="text-gray-400">Start:</span>
                <input
                  type="datetime-local"
                  value={customStart}
                  onChange={(e) => { setCustomStart(e.target.value); setEventsPage(1); }}
                  className="bg-gray-900 border border-gray-700 rounded p-1 text-xs text-white"
                />
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-400">End:</span>
                <input
                  type="datetime-local"
                  value={customEnd}
                  onChange={(e) => { setCustomEnd(e.target.value); setEventsPage(1); }}
                  className="bg-gray-900 border border-gray-700 rounded p-1 text-xs text-white"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main View Area */}
      {error ? (
        <ErrorState message={error} retry={() => fetchOverview(activeIp)} />
      ) : loading ? (
        <LoadingState message="Investigating IP address evidence across telemetry..." />
      ) : !activeIp ? (
        <EmptyState
          title="No IP address selected"
          description="Enter an IPv4 or IPv6 address above to inspect its observed relationships across telemetry."
        />
      ) : summary && summary.total_events === 0 && summary.alerts_count === 0 ? (
        <EmptyState
          title="No telemetry observed"
          description={`No events or alerts have been observed for IP address ${activeIp} in the selected time range.`}
        />
      ) : overview && summary ? (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-gray-900/90 border border-gray-800 p-3 rounded-lg">
              <span className="text-[10px] text-gray-400 uppercase font-semibold block">Total Events</span>
              <span className="text-xl font-bold text-white mt-1 block">{summary.total_events}</span>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Src: {summary.source_events_count} • Dst: {summary.destination_events_count}
              </div>
            </div>

            <div className="bg-gray-900/90 border border-gray-800 p-3 rounded-lg">
              <span className="text-[10px] text-red-400 uppercase font-semibold block">Alerts</span>
              <span className="text-xl font-bold text-red-400 mt-1 block">{summary.alerts_count}</span>
              <div className="text-[10px] text-gray-500 mt-0.5">Deduplicated</div>
            </div>

            <div className="bg-gray-900/90 border border-gray-800 p-3 rounded-lg">
              <span className="text-[10px] text-blue-400 uppercase font-semibold block">Hosts</span>
              <span className="text-xl font-bold text-blue-300 mt-1 block">{summary.hosts_count}</span>
              <div className="text-[10px] text-gray-500 mt-0.5">Observed in events</div>
            </div>

            <div className="bg-gray-900/90 border border-gray-800 p-3 rounded-lg">
              <span className="text-[10px] text-emerald-400 uppercase font-semibold block">Agents</span>
              <span className="text-xl font-bold text-emerald-300 mt-1 block">{summary.agents_count}</span>
              <div className="text-[10px] text-gray-500 mt-0.5">Telemetry agents</div>
            </div>

            <div className="bg-gray-900/90 border border-gray-800 p-3 rounded-lg">
              <span className="text-[10px] text-purple-400 uppercase font-semibold block">Users</span>
              <span className="text-xl font-bold text-purple-300 mt-1 block">{summary.users_count}</span>
              <div className="text-[10px] text-gray-500 mt-0.5">Observed usernames</div>
            </div>

            <div className="bg-gray-900/90 border border-gray-800 p-3 rounded-lg">
              <span className="text-[10px] text-amber-400 uppercase font-semibold block">Investigations</span>
              <span className="text-xl font-bold text-amber-300 mt-1 block">{summary.investigations_count}</span>
              <div className="text-[10px] text-gray-500 mt-0.5">Evidence linked</div>
            </div>

            <div className="bg-gray-900/90 border border-gray-800 p-3 rounded-lg">
              <span className="text-[10px] text-rose-400 uppercase font-semibold block">ATT&CK Techniques</span>
              <span className="text-xl font-bold text-rose-300 mt-1 block">{summary.mitre_techniques_count}</span>
              <div className="text-[10px] text-gray-500 mt-0.5">Explicitly mapped</div>
            </div>
          </div>

          {/* Temporal Provenance Card */}
          <Card>
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
              <div className="flex items-center space-x-4">
                <div>
                  <span className="text-gray-500 uppercase block text-[10px] font-semibold">First Observed</span>
                  <span className="text-gray-200 font-mono">
                    {summary.first_observed ? new Date(summary.first_observed).toLocaleString() : 'N/A'}
                  </span>
                </div>
                <div className="text-gray-700">|</div>
                <div>
                  <span className="text-gray-500 uppercase block text-[10px] font-semibold">Last Observed</span>
                  <span className="text-gray-200 font-mono">
                    {summary.last_observed ? new Date(summary.last_observed).toLocaleString() : 'N/A'}
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-400">Classified Scope:</span>
                <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 font-mono uppercase text-[11px] border border-gray-700">
                  {summary.address_scope}
                </span>
                <span className="text-gray-500 text-[11px]">(Descriptive network address classification)</span>
              </div>
            </CardContent>
          </Card>

          {/* Navigation Tabs */}
          <div className="border-b border-gray-800">
            <nav className="flex space-x-4">
              <button
                onClick={() => setActiveTab('events')}
                className={`pb-2.5 text-sm font-semibold transition-colors border-b-2 ${
                  activeTab === 'events'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Associated Events ({eventsTotal})
              </button>
              <button
                onClick={() => setActiveTab('alerts')}
                className={`pb-2.5 text-sm font-semibold transition-colors border-b-2 ${
                  activeTab === 'alerts'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Associated Alerts ({summary.alerts_count})
              </button>
              <button
                onClick={() => setActiveTab('hosts')}
                className={`pb-2.5 text-sm font-semibold transition-colors border-b-2 ${
                  activeTab === 'hosts'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Related Hosts ({summary.hosts_count})
              </button>
              <button
                onClick={() => setActiveTab('agents')}
                className={`pb-2.5 text-sm font-semibold transition-colors border-b-2 ${
                  activeTab === 'agents'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Related Agents ({summary.agents_count})
              </button>
              <button
                onClick={() => setActiveTab('users')}
                className={`pb-2.5 text-sm font-semibold transition-colors border-b-2 ${
                  activeTab === 'users'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Observed Users ({summary.users_count})
              </button>
              <button
                onClick={() => setActiveTab('investigations')}
                className={`pb-2.5 text-sm font-semibold transition-colors border-b-2 ${
                  activeTab === 'investigations'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Investigations ({summary.investigations_count})
              </button>
              <button
                onClick={() => setActiveTab('mitre')}
                className={`pb-2.5 text-sm font-semibold transition-colors border-b-2 ${
                  activeTab === 'mitre'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                MITRE ATT&CK ({summary.mitre_techniques_count})
              </button>
            </nav>
          </div>

          {/* TAB 1: Associated Events Table */}
          {activeTab === 'events' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  value={eventSearch}
                  onChange={(e) => { setEventSearch(e.target.value); setEventsPage(1); }}
                  placeholder="Filter events by host, type, user..."
                  className="bg-[#151518] border border-gray-800 rounded px-2.5 py-1 text-xs text-white placeholder-gray-600 focus:outline-none w-56"
                />
                <input
                  type="text"
                  value={eventCategoryFilter}
                  onChange={(e) => { setEventCategoryFilter(e.target.value); setEventsPage(1); }}
                  placeholder="Category (e.g. network, auth)"
                  className="bg-[#151518] border border-gray-800 rounded px-2.5 py-1 text-xs text-white placeholder-gray-600 focus:outline-none w-44"
                />
                <input
                  type="text"
                  value={eventProtocolFilter}
                  onChange={(e) => { setEventProtocolFilter(e.target.value); setEventsPage(1); }}
                  placeholder="Protocol (e.g. TCP, UDP)"
                  className="bg-[#151518] border border-gray-800 rounded px-2.5 py-1 text-xs text-white placeholder-gray-600 focus:outline-none w-36"
                />
              </div>

              {eventsLoading ? (
                <LoadingState message="Loading associated events..." />
              ) : events.length === 0 ? (
                <EmptyState
                  title="No events found"
                  description="No events matched the selected filters."
                />
              ) : (
                <Card>
                  <CardContent className="p-0 overflow-x-auto">
                    <DataTable
                      data={events}
                      keyExtractor={(r) => r.event_id || String(r.id)}
                      onRowClick={setSelectedEvent}
                      columns={[
                        { key: 'timestamp', title: 'Time', render: (r) => new Date(r.timestamp).toLocaleString() },
                        {
                          key: 'role',
                          title: 'Observed Role',
                          render: (r) => (
                            <span className="font-mono text-xs">
                              {r.source_ip === activeIp && r.destination_ip === activeIp ? (
                                <span className="text-purple-400 font-semibold">Source & Dest</span>
                              ) : r.source_ip === activeIp ? (
                                <span className="text-blue-400 font-semibold">Source</span>
                              ) : (
                                <span className="text-emerald-400 font-semibold">Destination</span>
                              )}
                            </span>
                          )
                        },
                        { key: 'event_type', title: 'Event Type', render: (r) => <span className="font-medium text-gray-200">{r.event_type}</span> },
                        { key: 'event_category', title: 'Category', render: (r) => r.event_category || 'N/A' },
                        { key: 'hostname', title: 'Host', render: (r) => r.hostname || 'N/A' },
                        { key: 'username', title: 'User', render: (r) => r.username || '-' },
                        { key: 'source_ip', title: 'Source IP', render: (r) => r.source_ip || '-' },
                        { key: 'destination_ip', title: 'Dest IP', render: (r) => r.destination_ip || '-' },
                        { key: 'protocol', title: 'Proto', render: (r) => r.protocol || '-' },
                        { key: 'severity', title: 'Severity', render: (r) => <SeverityBadge severity={r.severity || 'INFO'} /> },
                        {
                          key: 'raw_log',
                          title: 'Raw Log',
                          render: (r) => (
                            r.raw_log_id ? (
                              <Link
                                href={`/raw-logs?search=${encodeURIComponent(r.event_id || '')}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-blue-400 hover:underline font-mono"
                              >
                                #{r.raw_log_id}
                              </Link>
                            ) : '-'
                          )
                        }
                      ]}
                    />
                    <Pagination
                      currentPage={eventsPage}
                      pageSize={50}
                      total={eventsTotal}
                      onPageChange={setEventsPage}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* TAB 2: Associated Alerts */}
          {activeTab === 'alerts' && (
            <div className="space-y-4">
              {alertsLoading ? (
                <LoadingState message="Loading associated alerts..." />
              ) : alerts.length === 0 ? (
                <EmptyState
                  title="No associated alerts"
                  description="No security alerts currently reference events involving this IP."
                />
              ) : (
                <Card>
                  <CardContent className="p-0 overflow-x-auto">
                    <DataTable
                      data={alerts}
                      keyExtractor={(r) => r.alert_id || String(r.id)}
                      onRowClick={setSelectedAlert}
                      columns={[
                        { key: 'last_seen', title: 'Time', render: (r) => new Date(r.last_seen || r.first_seen).toLocaleString() },
                        { key: 'severity', title: 'Severity', render: (r) => <SeverityBadge severity={r.severity} /> },
                        { key: 'title', title: 'Alert Title', render: (r) => <span className="font-medium text-gray-200">{r.title}</span> },
                        { key: 'status', title: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                        {
                          key: 'roles',
                          title: 'IP Roles in Evidence',
                          render: (r) => (
                            <span className="text-xs text-gray-300 capitalize font-mono">
                              {r.observed_roles?.join(', ') || 'Trigger Event'}
                            </span>
                          )
                        },
                        { key: 'rule_name', title: 'Detection Rule', render: (r) => r.rule_name || `Rule #${r.rule_id}` || '-' },
                        {
                          key: 'mitre',
                          title: 'MITRE',
                          render: (r) => (
                            r.mitre_techniques && r.mitre_techniques.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {r.mitre_techniques.map((t: string) => (
                                  <span key={t} className="px-1.5 py-0.5 rounded text-[10px] bg-red-950/40 text-red-300 border border-red-800">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            ) : '-'
                          )
                        }
                      ]}
                    />
                    <Pagination
                      currentPage={alertsPage}
                      pageSize={50}
                      total={alertsTotal}
                      onPageChange={setAlertsPage}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* TAB 3: Related Hosts */}
          {activeTab === 'hosts' && (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <DataTable<any>
                  data={overview.associated_hosts || []}
                  keyExtractor={(r: any) => r.hostname}
                  columns={[
                    { key: 'hostname', title: 'Hostname', render: (r: any) => <span className="font-semibold text-white">{r.hostname}</span> },
                    { key: 'operating_system', title: 'OS', render: (r: any) => r.operating_system || '-' },
                    { key: 'event_count', title: 'Observed Events', render: (r: any) => <span className="font-mono">{r.event_count}</span> },
                    {
                      key: 'roles',
                      title: 'Observed Roles',
                      render: (r: any) => (
                        <span className="capitalize text-xs text-gray-300 font-mono">
                          {r.roles?.join(', ') || '-'}
                        </span>
                      )
                    },
                    { key: 'first_observed', title: 'First Seen', render: (r: any) => r.first_observed ? new Date(r.first_observed).toLocaleString() : '-' },
                    { key: 'last_observed', title: 'Last Seen', render: (r: any) => r.last_observed ? new Date(r.last_observed).toLocaleString() : '-' },
                    {
                      key: 'actions',
                      title: '',
                      render: (r: any) => (
                        <Link
                          href={`/attack-timeline?hostname=${encodeURIComponent(r.hostname)}&search=${encodeURIComponent(activeIp)}`}
                          className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-2 py-1 rounded"
                        >
                          Host Timeline Context
                        </Link>
                      )
                    }
                  ]}
                />
              </CardContent>
            </Card>
          )}

          {/* TAB 4: Related Agents */}
          {activeTab === 'agents' && (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <DataTable<any>
                  data={overview.associated_agents || []}
                  keyExtractor={(r: any) => r.agent_id}
                  columns={[
                    { key: 'agent_id', title: 'Agent ID', render: (r: any) => <span className="font-mono text-white">{r.agent_id}</span> },
                    { key: 'hostname', title: 'Hostname', render: (r: any) => r.hostname || '-' },
                    { key: 'status', title: 'Status', render: (r: any) => <StatusBadge status={r.status || 'OFFLINE'} /> },
                    { key: 'operating_system', title: 'OS', render: (r: any) => r.operating_system || '-' },
                    { key: 'event_count', title: 'Events Involving IP', render: (r: any) => <span className="font-mono">{r.event_count}</span> }
                  ]}
                />
              </CardContent>
            </Card>
          )}

          {/* TAB 5: Observed Users */}
          {activeTab === 'users' && (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <DataTable<any>
                  data={overview.associated_users || []}
                  keyExtractor={(r: any) => r.username}
                  columns={[
                    { key: 'username', title: 'Observed Username', render: (r: any) => <span className="font-semibold text-white font-mono">{r.username}</span> },
                    { key: 'event_count', title: 'Events with IP', render: (r: any) => <span className="font-mono">{r.event_count}</span> },
                    {
                      key: 'associated_hosts',
                      title: 'Associated Hosts',
                      render: (r: any) => (
                        <div className="flex flex-wrap gap-1">
                          {r.associated_hosts?.map((h: string) => (
                            <span key={h} className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 text-xs">
                              {h}
                            </span>
                          ))}
                        </div>
                      )
                    },
                    { key: 'first_observed', title: 'First Observed', render: (r: any) => r.first_observed ? new Date(r.first_observed).toLocaleString() : '-' },
                    { key: 'last_observed', title: 'Last Observed', render: (r: any) => r.last_observed ? new Date(r.last_observed).toLocaleString() : '-' }
                  ]}
                />
              </CardContent>
            </Card>
          )}

          {/* TAB 6: Investigations */}
          {activeTab === 'investigations' && (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <DataTable<any>
                  data={overview.associated_investigations || []}
                  keyExtractor={(r: any) => String(r.id)}
                  columns={[
                    { key: 'id', title: 'ID', render: (r: any) => `#${r.id}` },
                    { key: 'title', title: 'Investigation Title', render: (r: any) => <span className="font-semibold text-white">{r.title}</span> },
                    { key: 'status', title: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
                    { key: 'severity', title: 'Severity', render: (r: any) => <SeverityBadge severity={r.severity} /> },
                    { key: 'evidence_count_involving_ip', title: 'Evidence Involving IP', render: (r: any) => <span className="font-mono">{r.evidence_count_involving_ip} items</span> },
                    { key: 'updated_at', title: 'Last Updated', render: (r: any) => new Date(r.updated_at).toLocaleString() },
                    {
                      key: 'actions',
                      title: '',
                      render: (r: any) => (
                        <Link
                          href={`/investigations/${r.id}`}
                          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded transition-colors"
                        >
                          Open Investigation →
                        </Link>
                      )
                    }
                  ]}
                />
              </CardContent>
            </Card>
          )}

          {/* TAB 7: Explicit MITRE ATT&CK Relationships */}
          {activeTab === 'mitre' && (
            <div className="space-y-4">
              <div className="bg-red-950/20 border border-red-900/40 p-4 rounded-lg text-xs text-gray-300">
                <span className="font-semibold text-red-400 block mb-1">Analytical Boundary Notice</span>
                These MITRE ATT&CK techniques belong to evidence (alerts, detection rules, or direct event records) that interact with this IP address.
                The existence of a technique mapping does <span className="font-semibold underline">not</span> automatically prove attacker attribution or hostile intent for the IP address itself.
              </div>

              {overview.mitre_techniques.length === 0 ? (
                <EmptyState
                  title="No explicit MITRE mappings"
                  description="No explicit MITRE techniques are currently attached to events or alerts involving this IP address."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {overview.mitre_techniques.map((mt: any) => (
                    <div
                      key={mt.technique_id}
                      onClick={() => setSelectedMitre(mt)}
                      className="bg-gray-900/90 border border-gray-800 hover:border-red-900/70 p-4 rounded-lg cursor-pointer transition-all space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-red-400 bg-red-950/60 px-2 py-0.5 rounded border border-red-900/50">
                          {mt.technique_id}
                        </span>
                        <span className="text-[10px] text-gray-400 uppercase font-semibold">
                          {mt.relationship}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">{mt.name}</h4>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {mt.tactics?.map((tac: any) => (
                            <span key={tac.tactic_id} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">
                              {tac.name}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="pt-2 border-t border-gray-800/80 flex items-center justify-between text-[11px] text-gray-400">
                        <span>Confidence: <strong className="text-gray-200">{mt.confidence}</strong></span>
                        <span className="text-blue-400 hover:underline">Inspect Details →</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Modals */}
      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {selectedAlert && (
        <AlertDetailsModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
        />
      )}

      {selectedMitre && (
        <MitreTechniqueDetailsModal
          technique={selectedMitre}
          onClose={() => setSelectedMitre(null)}
        />
      )}
    </div>
  )
}

export default function IpInvestigationPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading IP Investigation workspace..." />}>
      <IpInvestigationContent />
    </Suspense>
  )
}
