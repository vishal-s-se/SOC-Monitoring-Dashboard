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

function HostInvestigationContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const hostParam = searchParams.get('host') || ''
  const timePresetParam = (searchParams.get('time_preset') as TimePreset) || 'all'

  const [inputHost, setInputHost] = useState(hostParam)
  const [activeHost, setActiveHost] = useState(hostParam)
  const [timePreset, setTimePreset] = useState<TimePreset>(timePresetParam)
  const [customStart, setCustomStart] = useState(searchParams.get('start_time') || '')
  const [customEnd, setCustomEnd] = useState(searchParams.get('end_time') || '')

  // Data states
  const [overview, setOverview] = useState<any | null>(null)
  const [deviations, setDeviations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Sub-tabs
  const [activeTab, setActiveTab] = useState<'events' | 'alerts' | 'agents' | 'users' | 'network' | 'investigations' | 'mitre'>('events')

  // Events table state
  const [events, setEvents] = useState<any[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsPage, setEventsPage] = useState(1)
  const [eventsTotal, setEventsTotal] = useState(0)
  const [eventCategoryFilter, setEventCategoryFilter] = useState('')
  const [eventProtocolFilter, setEventProtocolFilter] = useState('')
  const [eventSeverityFilter, setEventSeverityFilter] = useState('')
  const [eventSearch, setEventSearch] = useState('')

  // Alerts table state
  const [alerts, setAlerts] = useState<any[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsPage, setAlertsPage] = useState(1)
  const [alertsTotal, setAlertsTotal] = useState(0)
  const [alertSeverityFilter, setAlertSeverityFilter] = useState('')
  const [alertStatusFilter, setAlertStatusFilter] = useState('')

  // Modals
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)
  const [selectedAlert, setSelectedAlert] = useState<any | null>(null)
  const [selectedMitre, setSelectedMitre] = useState<any | null>(null)

  // Real-time WebSocket integration
  const { lastMessage } = useWebSocket()

  // Time preset to bounds helper
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
    const mins = minutesMap[timePreset] || 60
    const start = new Date(now.getTime() - mins * 60 * 1000)
    return {
      start: start.toISOString(),
      end: now.toISOString()
    }
  }, [timePreset, customStart, customEnd])

  // Sync URL query state
  const updateUrl = useCallback((newHost: string, newPreset: TimePreset, cStart = '', cEnd = '') => {
    const params = new URLSearchParams()
    if (newHost) params.set('host', newHost)
    if (newPreset !== 'all') params.set('time_preset', newPreset)
    if (newPreset === 'custom') {
      if (cStart) params.set('start_time', cStart)
      if (cEnd) params.set('end_time', cEnd)
    }
    router.replace(`/host-investigation?${params.toString()}`)
  }, [router])

  // Fetch Host Overview
  const fetchOverview = useCallback(async (targetHost: string) => {
    if (!targetHost.trim()) {
      setOverview(null)
      setError('')
      return
    }
    try {
      setLoading(true)
      setError('')
      const bounds = calculateTimeBounds()
      const query: Record<string, any> = {}
      if (bounds.start) query.start_time = bounds.start
      if (bounds.end) query.end_time = bounds.end

      const res = await api.get<any>(`/host-investigation/${encodeURIComponent(targetHost.trim())}`, query)
      
      try {
        const devRes = await api.get<any[]>(`/analytics/deviations?entity_type=HOST&entity_id=${encodeURIComponent(targetHost.trim())}&limit=5`)
        setDeviations(devRes || [])
      } catch (e) {
        setDeviations([])
      }

      setOverview(res)
    } catch (err: any) {
      setError(err.message || 'Failed to load Host investigation')
      setOverview(null)
    } finally {
      setLoading(false)
    }
  }, [calculateTimeBounds])

  // Fetch Events for the Host
  const fetchEvents = useCallback(async (targetHost: string) => {
    if (!targetHost.trim()) {
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
      if (eventCategoryFilter.trim()) query.event_category = eventCategoryFilter.trim()
      if (eventProtocolFilter.trim()) query.protocol = eventProtocolFilter.trim()
      if (eventSeverityFilter.trim()) query.severity = eventSeverityFilter.trim()
      if (eventSearch.trim()) query.search = eventSearch.trim()
      if (bounds.start) query.start_time = bounds.start
      if (bounds.end) query.end_time = bounds.end

      const res = await api.get<any>(`/host-investigation/${encodeURIComponent(targetHost.trim())}/events`, query)
      setEvents(res.items || [])
      setEventsTotal(res.total || 0)
    } catch {
      setEvents([])
      setEventsTotal(0)
    } finally {
      setEventsLoading(false)
    }
  }, [eventsPage, eventCategoryFilter, eventProtocolFilter, eventSeverityFilter, eventSearch, calculateTimeBounds])

  // Fetch Alerts for the Host
  const fetchAlerts = useCallback(async (targetHost: string) => {
    if (!targetHost.trim()) {
      setAlerts([])
      setAlertsTotal(0)
      return
    }
    try {
      setAlertsLoading(true)
      const bounds = calculateTimeBounds()
      const query: Record<string, any> = {
        page: alertsPage,
        page_size: 50
      }
      if (alertSeverityFilter.trim()) query.severity = alertSeverityFilter.trim()
      if (alertStatusFilter.trim()) query.status = alertStatusFilter.trim()
      if (bounds.start) query.start_time = bounds.start
      if (bounds.end) query.end_time = bounds.end

      const res = await api.get<any>(`/host-investigation/${encodeURIComponent(targetHost.trim())}/alerts`, query)
      setAlerts(res.items || [])
      setAlertsTotal(res.total || 0)
    } catch {
      setAlerts([])
      setAlertsTotal(0)
    } finally {
      setAlertsLoading(false)
    }
  }, [alertsPage, alertSeverityFilter, alertStatusFilter, calculateTimeBounds])

  // Initial load or param changes
  useEffect(() => {
    if (hostParam) {
      setInputHost(hostParam)
      setActiveHost(hostParam)
      fetchOverview(hostParam)
      fetchEvents(hostParam)
      fetchAlerts(hostParam)
    }
  }, [hostParam, fetchOverview, fetchEvents, fetchAlerts])

  // Refetch when filters change
  useEffect(() => {
    if (activeHost) {
      fetchEvents(activeHost)
    }
  }, [activeHost, eventsPage, eventCategoryFilter, eventProtocolFilter, eventSeverityFilter, eventSearch, fetchEvents])

  useEffect(() => {
    if (activeHost) {
      fetchAlerts(activeHost)
    }
  }, [activeHost, alertsPage, alertSeverityFilter, alertStatusFilter, fetchAlerts])

  // Real-time WebSocket updates filtered specifically for this host
  useEffect(() => {
    if (!lastMessage || !activeHost || !overview) return

    const { type, data } = lastMessage
    if (type === 'new_event') {
      const evHname = data?.hostname || ''
      const evHostId = String(data?.host_id || '')
      const curHname = overview.host?.hostname || activeHost
      const curHostId = String(overview.host?.id || '')
      if (evHname === curHname || evHostId === curHostId) {
        fetchOverview(activeHost)
        if (activeTab === 'events' && eventsPage === 1) {
          fetchEvents(activeHost)
        }
      }
    } else if (type === 'new_alert' || type === 'alert_updated') {
      const alHostId = String(data?.host_id || '')
      const curHostId = String(overview.host?.id || '')
      if (alHostId === curHostId) {
        fetchOverview(activeHost)
        if (activeTab === 'alerts' && alertsPage === 1) {
          fetchAlerts(activeHost)
        }
      }
    }
  }, [lastMessage, activeHost, overview, activeTab, eventsPage, alertsPage, fetchOverview, fetchEvents, fetchAlerts])

  // Search submit handler
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputHost.trim()) return
    const cleanHost = inputHost.trim()
    setActiveHost(cleanHost)
    setEventsPage(1)
    setAlertsPage(1)
    updateUrl(cleanHost, timePreset, customStart, customEnd)
    fetchOverview(cleanHost)
    fetchEvents(cleanHost)
    fetchAlerts(cleanHost)
  }

  // Handle Preset change
  const handlePresetChange = (preset: TimePreset) => {
    setTimePreset(preset)
    updateUrl(activeHost, preset, customStart, customEnd)
    if (activeHost) {
      fetchOverview(activeHost)
      fetchEvents(activeHost)
      fetchAlerts(activeHost)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header and Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">Host Investigation</h1>
            <span className="text-xs bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 px-2.5 py-1 rounded font-semibold uppercase tracking-wider">
              Observed Telemetry
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Investigate host identity, associated agents, users, observed network IPs, alerts, and explicit MITRE ATT&CK evidence
          </p>
        </div>

        {/* Search input form */}
        <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2 w-full md:w-auto">
          <input
            type="text"
            value={inputHost}
            onChange={(e) => setInputHost(e.target.value)}
            placeholder="Hostname or Host ID..."
            className="w-full md:w-72 bg-gray-900 border border-gray-700 rounded-lg px-3.5 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shrink-0"
          >
            Investigate
          </button>
        </form>
      </div>

      {/* Analyst Controls: Time Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-900/60 border border-gray-800 p-3.5 rounded-xl">
        {/* Time Presets */}
        <div className="flex items-center space-x-1.5 bg-gray-950 p-1 rounded-lg border border-gray-800 text-xs font-medium">
          <span className="text-gray-400 px-2">Time:</span>
          {(['1h', '24h', '7d', 'all', 'custom'] as TimePreset[]).map((preset) => (
            <button
              key={preset}
              onClick={() => handlePresetChange(preset)}
              className={`px-3 py-1 rounded transition-colors uppercase ${
                timePreset === preset
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Pivot to Attack Timeline */}
        {activeHost && (
          <div className="flex items-center space-x-2">
            <Link
              href={`/attack-timeline?hostname=${encodeURIComponent(overview?.host?.hostname || activeHost)}`}
              className="text-xs bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/60 px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1 font-semibold"
            >
              <span>Attack Timeline Context →</span>
            </Link>
          </div>
        )}
      </div>

      {/* Custom Time Range Selector */}
      {timePreset === 'custom' && (
        <div className="flex items-center space-x-4 bg-gray-950/90 border border-gray-800 p-3 rounded-lg text-xs">
          <span className="text-gray-400 font-semibold uppercase">Custom Window:</span>
          <input
            type="datetime-local"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white"
          />
          <span className="text-gray-500">to</span>
          <input
            type="datetime-local"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white"
          />
          <button
            onClick={() => {
              updateUrl(activeHost, 'custom', customStart, customEnd)
              if (activeHost) {
                fetchOverview(activeHost)
                fetchEvents(activeHost)
                fetchAlerts(activeHost)
              }
            }}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
          >
            Apply Range
          </button>
        </div>
      )}

      {/* Loading & Error States */}
      {loading && <LoadingState message={`Investigating host ${activeHost}...`} />}
      {error && !loading && <ErrorState message={error} retry={() => fetchOverview(activeHost)} />}

      {/* Empty State before any search */}
      {!activeHost && !loading && (
        <EmptyState
          title="Enter a Host to Investigate"
          description="Provide a hostname or host ID above to examine its observed events, agents, network IPs, users, alerts, and investigations."
        />
      )}

      {/* Investigation Details Workspace */}
      {overview && !loading ? (
        <div className="space-y-6">
          {/* Host Header / Provenance Card */}
          <div className="bg-[#121620] border border-gray-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800/80 pb-4">
              <div className="flex items-center space-x-3">
                <span className="px-3 py-1 bg-blue-950 border border-blue-800 text-blue-300 font-mono text-sm font-bold rounded">
                  {overview.host.hostname}
                </span>
                <span className="text-xs bg-gray-800 border border-gray-700 text-gray-300 px-2.5 py-0.5 rounded font-mono">
                  ID: {overview.host.id}
                </span>
                <StatusBadge status={overview.host.status || 'UNKNOWN'} />
                {overview.host.operating_system && (
                  <span className="text-xs bg-gray-800/90 border border-gray-700 text-gray-300 px-2 py-0.5 rounded capitalize">
                    {overview.host.operating_system} {overview.host.os_version ? `(${overview.host.os_version})` : ''}
                  </span>
                )}
              </div>

              {/* Analytical Rule Notice */}
              <div className="text-[11px] text-gray-400 bg-gray-900/90 border border-gray-800 px-3 py-1.5 rounded-lg flex items-center space-x-2">
                <span className="text-indigo-400 font-bold">Passive Observation:</span>
                <span>Values represent recorded telemetry only; no compromise or attribution inferred.</span>
              </div>
            </div>

            {/* Provenance & Temporal Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="text-gray-500 uppercase font-semibold">Host Identifier</p>
                <p className="text-gray-200 mt-1 font-mono">{overview.host.host_identifier}</p>
              </div>
              <div>
                <p className="text-gray-500 uppercase font-semibold">Primary IP</p>
                <p className="mt-1">
                  {overview.host.ip_address ? (
                    <Link
                      href={`/ip-investigation?ip=${encodeURIComponent(overview.host.ip_address)}`}
                      className="text-blue-400 hover:text-blue-300 hover:underline font-mono"
                    >
                      {overview.host.ip_address}
                    </Link>
                  ) : (
                    <span className="text-gray-500 font-mono">Unspecified</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-gray-500 uppercase font-semibold">First Canonical Event</p>
                <p className="text-gray-200 mt-1 font-medium">
                  {overview.summary.first_observed ? new Date(overview.summary.first_observed).toLocaleString() : 'No recorded events'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 uppercase font-semibold">Last Canonical Event</p>
                <p className="text-gray-200 mt-1 font-medium">
                  {overview.summary.last_observed ? new Date(overview.summary.last_observed).toLocaleString() : 'No recorded events'}
                </p>
              </div>
            </div>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            <Card>
              <CardContent className="p-3.5">
                <p className="text-xs text-gray-500 uppercase font-semibold">Total Events</p>
                <p className="text-xl font-bold text-white mt-1">{overview.summary.total_events}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3.5">
                <p className="text-xs text-gray-500 uppercase font-semibold">Alerts (Dedup)</p>
                <p className="text-xl font-bold text-yellow-400 mt-1">{overview.summary.alerts_count}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3.5">
                <p className="text-xs text-gray-500 uppercase font-semibold">Agents</p>
                <p className="text-xl font-bold text-blue-400 mt-1">{overview.agents.length}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3.5">
                <p className="text-xs text-gray-500 uppercase font-semibold">Observed Users</p>
                <p className="text-xl font-bold text-purple-400 mt-1">{overview.summary.users_count}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3.5">
                <p className="text-xs text-gray-500 uppercase font-semibold">Source IPs</p>
                <p className="text-xl font-bold text-emerald-400 mt-1">{overview.summary.source_ips_count}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3.5">
                <p className="text-xs text-gray-500 uppercase font-semibold">Destination IPs</p>
                <p className="text-xl font-bold text-cyan-400 mt-1">{overview.summary.destination_ips_count}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3.5">
                <p className="text-xs text-gray-500 uppercase font-semibold">MITRE Techs</p>
                <p className="text-xl font-bold text-red-400 mt-1">{overview.summary.mitre_techniques_count}</p>
              </CardContent>
            </Card>
          </div>

          {/* Sub-tab Navigation */}
          <div className="flex border-b border-gray-800 space-x-6 text-sm font-semibold">
            {[
              { id: 'events', label: 'Observed Events', count: overview.summary.total_events },
              { id: 'alerts', label: 'Associated Alerts', count: overview.summary.alerts_count },
              { id: 'agents', label: 'Associated Agents', count: overview.agents.length },
              { id: 'users', label: 'Observed Users', count: overview.summary.users_count },
              { id: 'network', label: 'Network IPs', count: overview.summary.source_ips_count + overview.summary.destination_ips_count },
              { id: 'investigations', label: 'Investigations', count: overview.summary.investigations_count },
              { id: 'mitre', label: 'MITRE ATT&CK', count: overview.summary.mitre_techniques_count },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-3 flex items-center space-x-2 transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* TAB 1: OBSERVED EVENTS */}
          {activeTab === 'events' && (
            <div className="space-y-4">
              {/* Event Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  type="text"
                  placeholder="Category (e.g. authentication, process)..."
                  value={eventCategoryFilter}
                  onChange={(e) => {
                    setEventCategoryFilter(e.target.value)
                    setEventsPage(1)
                  }}
                  className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder-gray-500"
                />
                <input
                  type="text"
                  placeholder="Protocol (e.g. TCP, UDP)..."
                  value={eventProtocolFilter}
                  onChange={(e) => {
                    setEventProtocolFilter(e.target.value)
                    setEventsPage(1)
                  }}
                  className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder-gray-500"
                />
                <input
                  type="text"
                  placeholder="Severity (INFO, LOW, HIGH)..."
                  value={eventSeverityFilter}
                  onChange={(e) => {
                    setEventSeverityFilter(e.target.value)
                    setEventsPage(1)
                  }}
                  className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder-gray-500"
                />
                <input
                  type="text"
                  placeholder="Search user, action, event ID..."
                  value={eventSearch}
                  onChange={(e) => {
                    setEventSearch(e.target.value)
                    setEventsPage(1)
                  }}
                  className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder-gray-500"
                />
              </div>

              {eventsLoading ? (
                <LoadingState message="Loading host events..." />
              ) : events.length === 0 ? (
                <EmptyState
                  title="No telemetry has been observed for this host in the selected time range"
                  description="Adjust the time window or remove filters to view events recorded for this host."
                />
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <DataTable<any>
                      data={events}
                      keyExtractor={(r: any) => r.id}
                      columns={[
                        {
                          key: 'timestamp',
                          title: 'Timestamp',
                          render: (r: any) => (
                            <span className="font-mono text-xs text-gray-300">
                              {new Date(r.timestamp).toLocaleString()}
                            </span>
                          )
                        },
                        {
                          key: 'event_type',
                          title: 'Event Type',
                          render: (r: any) => (
                            <button
                              onClick={() => setSelectedEvent(r)}
                              className="text-xs font-semibold text-blue-400 hover:text-blue-300 hover:underline text-left font-mono"
                            >
                              {r.event_type}
                            </button>
                          )
                        },
                        {
                          key: 'category',
                          title: 'Category',
                          render: (r: any) => (
                            <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded">
                              {r.event_category || 'N/A'}
                            </span>
                          )
                        },
                        {
                          key: 'username',
                          title: 'User',
                          render: (r: any) => (
                            <span className="text-xs text-gray-200 font-mono">
                              {r.username || '-'}
                            </span>
                          )
                        },
                        {
                          key: 'source_ip',
                          title: 'Source IP',
                          render: (r: any) => (
                            r.source_ip ? (
                              <Link
                                href={`/ip-investigation?ip=${encodeURIComponent(r.source_ip)}`}
                                className="text-xs text-blue-400 hover:underline font-mono"
                              >
                                {r.source_ip}{r.source_port ? `:${r.source_port}` : ''}
                              </Link>
                            ) : '-'
                          )
                        },
                        {
                          key: 'destination_ip',
                          title: 'Destination IP',
                          render: (r: any) => (
                            r.destination_ip ? (
                              <Link
                                href={`/ip-investigation?ip=${encodeURIComponent(r.destination_ip)}`}
                                className="text-xs text-blue-400 hover:underline font-mono"
                              >
                                {r.destination_ip}{r.destination_port ? `:${r.destination_port}` : ''}
                              </Link>
                            ) : '-'
                          )
                        },
                        {
                          key: 'protocol',
                          title: 'Proto/Action',
                          render: (r: any) => (
                            <span className="text-xs text-gray-400">
                              {r.protocol || '-'}{r.action ? ` / ${r.action}` : ''}
                            </span>
                          )
                        },
                        {
                          key: 'raw_log',
                          title: 'Raw Log',
                          render: (r: any) => (
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
                        },
                        {
                          key: 'severity',
                          title: 'Severity',
                          render: (r: any) => <SeverityBadge severity={r.severity || 'INFO'} />
                        },
                        {
                          key: 'actions',
                          title: 'Inspect',
                          render: (r: any) => (
                            <button
                              onClick={() => setSelectedEvent(r)}
                              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 px-2.5 py-1 rounded transition-colors"
                            >
                              Details
                            </button>
                          )
                        }
                      ]}
                    />
                  </CardContent>
                </Card>
              )}

              {eventsTotal > 50 && (
                <Pagination
                  currentPage={eventsPage}
                  pageSize={50}
                  total={eventsTotal}
                  onPageChange={setEventsPage}
                />
              )}
            </div>
          )}

          {/* TAB 2: ASSOCIATED ALERTS */}
          {activeTab === 'alerts' && (
            <div className="space-y-4">
              {/* Alert Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Filter severity (LOW, MEDIUM, HIGH, CRITICAL)..."
                  value={alertSeverityFilter}
                  onChange={(e) => {
                    setAlertSeverityFilter(e.target.value)
                    setAlertsPage(1)
                  }}
                  className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder-gray-500"
                />
                <input
                  type="text"
                  placeholder="Filter status (OPEN, ACKNOWLEDGED, RESOLVED)..."
                  value={alertStatusFilter}
                  onChange={(e) => {
                    setAlertStatusFilter(e.target.value)
                    setAlertsPage(1)
                  }}
                  className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder-gray-500"
                />
              </div>

              {alertsLoading ? (
                <LoadingState message="Loading associated alerts..." />
              ) : alerts.length === 0 ? (
                <EmptyState
                  title="No alerts associated with this host"
                  description="No detection rules have fired or been directly associated with this host in the selected time range."
                />
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <DataTable<any>
                      data={alerts}
                      keyExtractor={(r: any) => r.id}
                      columns={[
                        {
                          key: 'alert_id',
                          title: 'Alert ID',
                          render: (r: any) => (
                            <button
                              onClick={() => setSelectedAlert(r)}
                              className="font-mono text-xs font-bold text-yellow-400 hover:text-yellow-300 hover:underline"
                            >
                              {r.alert_id}
                            </button>
                          )
                        },
                        {
                          key: 'title',
                          title: 'Title',
                          render: (r: any) => (
                            <div>
                              <div className="text-xs font-semibold text-white">{r.title}</div>
                              {r.rule_name && (
                                <div className="text-[11px] text-gray-400">Rule: {r.rule_name}</div>
                              )}
                            </div>
                          )
                        },
                        {
                          key: 'severity',
                          title: 'Severity',
                          render: (r: any) => <SeverityBadge severity={r.severity} />
                        },
                        {
                          key: 'status',
                          title: 'Status',
                          render: (r: any) => <StatusBadge status={r.status} />
                        },
                        {
                          key: 'mitre',
                          title: 'Explicit MITRE',
                          render: (r: any) => (
                            <div className="flex flex-wrap gap-1">
                              {r.mitre_techniques?.map((t: string) => (
                                <span key={t} className="text-[10px] bg-red-950/80 border border-red-800 text-red-300 px-1.5 py-0.5 rounded font-mono">
                                  {t}
                                </span>
                              ))}
                              {(!r.mitre_techniques || r.mitre_techniques.length === 0) && (
                                <span className="text-xs text-gray-500">-</span>
                              )}
                            </div>
                          )
                        },
                        {
                          key: 'last_seen',
                          title: 'Last Seen',
                          render: (r: any) => (
                            <span className="text-xs text-gray-400">
                              {new Date(r.last_seen).toLocaleString()}
                            </span>
                          )
                        },
                        {
                          key: 'actions',
                          title: 'Actions',
                          render: (r: any) => (
                            <button
                              onClick={() => setSelectedAlert(r)}
                              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 px-2.5 py-1 rounded transition-colors"
                            >
                              Inspect
                            </button>
                          )
                        }
                      ]}
                    />
                  </CardContent>
                </Card>
              )}

              {alertsTotal > 50 && (
                <Pagination
                  currentPage={alertsPage}
                  pageSize={50}
                  total={alertsTotal}
                  onPageChange={setAlertsPage}
                />
              )}
            </div>
          )}

          {/* TAB 3: ASSOCIATED AGENTS */}
          {activeTab === 'agents' && (
            <div className="space-y-4">
              {overview.agents.length === 0 ? (
                <EmptyState
                  title="No agents connected to this host"
                  description="This host does not currently have registered SOC agent collectors."
                />
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <DataTable<any>
                      data={overview.agents}
                      keyExtractor={(r: any) => r.agent_id}
                      columns={[
                        {
                          key: 'status',
                          title: 'Status',
                          render: (r: any) => <StatusBadge status={r.status || 'UNKNOWN'} />
                        },
                        {
                          key: 'agent_id',
                          title: 'Agent ID',
                          render: (r: any) => <span className="font-mono text-xs font-semibold text-white">{r.agent_id}</span>
                        },
                        {
                          key: 'version',
                          title: 'Agent Version',
                          render: (r: any) => <span className="text-xs text-gray-300 font-mono">{r.agent_version || 'N/A'}</span>
                        },
                        {
                          key: 'last_heartbeat',
                          title: 'Last Heartbeat',
                          render: (r: any) => (
                            <span className="text-xs text-gray-400">
                              {r.last_heartbeat ? new Date(r.last_heartbeat).toLocaleString() : 'Never'}
                            </span>
                          )
                        },
                        {
                          key: 'ip_address',
                          title: 'Agent IP',
                          render: (r: any) => (
                            r.ip_address ? (
                              <Link
                                href={`/ip-investigation?ip=${encodeURIComponent(r.ip_address)}`}
                                className="text-blue-400 hover:underline font-mono text-xs"
                              >
                                {r.ip_address}
                              </Link>
                            ) : '-'
                          )
                        },
                        {
                          key: 'actions',
                          title: 'Actions',
                          render: (r: any) => (
                            <Link
                              href={`/attack-timeline?agent_id=${r.id}`}
                              className="text-xs bg-gray-800 hover:bg-indigo-600 text-gray-300 hover:text-white px-2.5 py-1 rounded transition-colors inline-block"
                            >
                              Timeline Context
                            </Link>
                          )
                        }
                      ]}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* TAB 4: OBSERVED USERS */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              {overview.users.length === 0 ? (
                <EmptyState
                  title="No users observed on this host"
                  description="No explicit user credentials have been observed in events for this host in the selected time range."
                />
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <DataTable<any>
                      data={overview.users}
                      keyExtractor={(r: any) => r.username}
                      columns={[
                        {
                          key: 'username',
                          title: 'Observed Username',
                          render: (r: any) => (
                            <span className="font-mono text-xs font-semibold text-purple-300 bg-purple-950/60 border border-purple-800/60 px-2 py-0.5 rounded">
                              {r.username}
                            </span>
                          )
                        },
                        {
                          key: 'event_count',
                          title: 'Event Count',
                          render: (r: any) => <span className="text-xs font-bold text-white">{r.event_count}</span>
                        },
                        {
                          key: 'first_observed',
                          title: 'First Observed',
                          render: (r: any) => (
                            <span className="text-xs text-gray-400">
                              {r.first_observed ? new Date(r.first_observed).toLocaleString() : '-'}
                            </span>
                          )
                        },
                        {
                          key: 'last_observed',
                          title: 'Last Observed',
                          render: (r: any) => (
                            <span className="text-xs text-gray-400">
                              {r.last_observed ? new Date(r.last_observed).toLocaleString() : '-'}
                            </span>
                          )
                        },
                        {
                          key: 'associated_ips',
                          title: 'Associated Source IPs',
                          render: (r: any) => (
                            <div className="flex flex-wrap gap-1">
                              {r.associated_ips?.map((ip: string) => (
                                <Link
                                  key={ip}
                                  href={`/ip-investigation?ip=${encodeURIComponent(ip)}`}
                                  className="text-[11px] text-blue-400 hover:underline font-mono bg-gray-800 px-1.5 py-0.5 rounded"
                                >
                                  {ip}
                                </Link>
                              ))}
                              {(!r.associated_ips || r.associated_ips.length === 0) && '-'}
                            </div>
                          )
                        }
                      ]}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* TAB 5: NETWORK IPS (SOURCE & DESTINATION) */}
          {activeTab === 'network' && (
            <div className="space-y-6">
              {/* Source IPs */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                  <span>Source IP Addresses</span>
                  <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded font-mono">
                    {overview.source_ips.length}
                  </span>
                </h3>
                {overview.source_ips.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No source IP addresses observed in host telemetry.</p>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <DataTable<any>
                        data={overview.source_ips}
                        keyExtractor={(r: any) => r.ip_address}
                        columns={[
                          {
                            key: 'ip_address',
                            title: 'IP Address',
                            render: (r: any) => (
                              <Link
                                href={`/ip-investigation?ip=${encodeURIComponent(r.ip_address)}`}
                                className="font-mono text-xs font-semibold text-blue-400 hover:underline"
                              >
                                {r.ip_address}
                              </Link>
                            )
                          },
                          {
                            key: 'event_count',
                            title: 'Observed Events',
                            render: (r: any) => <span className="text-xs font-bold text-white">{r.event_count}</span>
                          },
                          {
                            key: 'first_observed',
                            title: 'First Observed',
                            render: (r: any) => (
                              <span className="text-xs text-gray-400">
                                {r.first_observed ? new Date(r.first_observed).toLocaleString() : '-'}
                              </span>
                            )
                          },
                          {
                            key: 'last_observed',
                            title: 'Last Observed',
                            render: (r: any) => (
                              <span className="text-xs text-gray-400">
                                {r.last_observed ? new Date(r.last_observed).toLocaleString() : '-'}
                              </span>
                            )
                          },
                          {
                            key: 'actions',
                            title: 'Investigate',
                            render: (r: any) => (
                              <Link
                                href={`/ip-investigation?ip=${encodeURIComponent(r.ip_address)}`}
                                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 px-2.5 py-1 rounded transition-colors inline-block"
                              >
                                Investigate IP
                              </Link>
                            )
                          }
                        ]}
                      />
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Destination IPs */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                  <span>Destination IP Addresses</span>
                  <span className="text-xs bg-cyan-950 text-cyan-400 border border-cyan-800 px-2 py-0.5 rounded font-mono">
                    {overview.destination_ips.length}
                  </span>
                </h3>
                {overview.destination_ips.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No destination IP addresses observed in host telemetry.</p>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <DataTable<any>
                        data={overview.destination_ips}
                        keyExtractor={(r: any) => r.ip_address}
                        columns={[
                          {
                            key: 'ip_address',
                            title: 'IP Address',
                            render: (r: any) => (
                              <Link
                                href={`/ip-investigation?ip=${encodeURIComponent(r.ip_address)}`}
                                className="font-mono text-xs font-semibold text-blue-400 hover:underline"
                              >
                                {r.ip_address}
                              </Link>
                            )
                          },
                          {
                            key: 'event_count',
                            title: 'Observed Events',
                            render: (r: any) => <span className="text-xs font-bold text-white">{r.event_count}</span>
                          },
                          {
                            key: 'first_observed',
                            title: 'First Observed',
                            render: (r: any) => (
                              <span className="text-xs text-gray-400">
                                {r.first_observed ? new Date(r.first_observed).toLocaleString() : '-'}
                              </span>
                            )
                          },
                          {
                            key: 'last_observed',
                            title: 'Last Observed',
                            render: (r: any) => (
                              <span className="text-xs text-gray-400">
                                {r.last_observed ? new Date(r.last_observed).toLocaleString() : '-'}
                              </span>
                            )
                          },
                          {
                            key: 'actions',
                            title: 'Investigate',
                            render: (r: any) => (
                              <Link
                                href={`/ip-investigation?ip=${encodeURIComponent(r.ip_address)}`}
                                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 px-2.5 py-1 rounded transition-colors inline-block"
                              >
                                Investigate IP
                              </Link>
                            )
                          }
                        ]}
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: ASSOCIATED INVESTIGATIONS */}
          {activeTab === 'investigations' && (
            <div className="space-y-4">
              {overview.investigations.length === 0 ? (
                <EmptyState
                  title="No investigations link to this host"
                  description="No active or past investigations have added evidence records referencing this host, its events, or its alerts."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {overview.investigations.map((inv: any) => (
                    <div
                      key={inv.id}
                      className="bg-gray-900/90 border border-gray-800 hover:border-gray-700 p-4 rounded-lg space-y-3 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-blue-400">
                          INV-{inv.id}
                        </span>
                        <StatusBadge status={inv.status} />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">{inv.title}</h4>
                        <div className="flex items-center space-x-2 mt-2">
                          <SeverityBadge severity={inv.severity} />
                          <span className="text-xs text-gray-400">
                            {inv.evidence_count_involving_host} evidence records
                          </span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-gray-800 flex items-center justify-between text-xs">
                        <span className="text-gray-500">
                          {new Date(inv.updated_at).toLocaleDateString()}
                        </span>
                        <Link
                          href={`/investigations/${inv.id}`}
                          className="text-blue-400 hover:text-blue-300 hover:underline font-semibold"
                        >
                          Open Investigation →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 7: MITRE ATT&CK */}
          {activeTab === 'mitre' && (
            <div className="space-y-4">
              {/* Scope Boundary Notice */}
              <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-300 leading-relaxed flex items-start space-x-3">
                <span className="text-yellow-400 text-base">⚠️</span>
                <div>
                  <strong className="text-white block font-semibold mb-0.5">Explicit Evidence Mapping Boundary:</strong>
                  The presence of a MITRE technique below indicates that an analyst or configured detection rule explicitly mapped this technique to evidence (an event, detection rule, or alert) involving this host. It does NOT automatically prove the host itself is compromised or infected.
                </div>
              </div>

              {overview.mitre_techniques.length === 0 ? (
                <EmptyState
                  title="No explicit MITRE mappings"
                  description="No explicit MITRE techniques are currently attached to events, detection rules, or alerts involving this host."
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

export default function HostInvestigationPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading Host Investigation..." />}>
      <HostInvestigationContent />
    </Suspense>
  )
}
