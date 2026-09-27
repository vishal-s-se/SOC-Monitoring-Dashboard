"use client"

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/ui/States'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { Pagination } from '@/components/ui/Pagination'
import { EventDetailsModal } from '@/components/ui/EventDetailsModal'
import { RawLogDetailsModal } from '@/components/ui/RawLogDetailsModal'
import { useWebSocket } from '@/hooks/useWebSocket'

type TimePreset = '15m' | '30m' | '1h' | '6h' | '24h' | 'all' | 'custom'

interface TimelineItem {
  id: number
  event_id: string
  timestamp: string
  received_at?: string
  event_type?: string
  event_category?: string
  severity?: string
  hostname?: string
  agent_id?: number
  host_id?: number
  username?: string
  source_ip?: string
  source_port?: number
  destination_ip?: string
  destination_port?: number
  protocol?: string
  action?: string
  process_name?: string
  command_line?: string
  source_type?: string
  raw_log_id?: number
  context_type?: string
  context_reason?: string
  metadata_?: any
}

function AttackTimelineContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const investigationIdParam = searchParams.get('investigation_id')
  const alertIdParam = searchParams.get('alert_id')
  const hostParam = searchParams.get('hostname')
  const agentParam = searchParams.get('agent_id')

  const [items, setItems] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(30)
  const [total, setTotal] = useState(0)

  // Filters
  const [timePreset, setTimePreset] = useState<TimePreset>(investigationIdParam || alertIdParam ? 'all' : '1h')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [order, setOrder] = useState<'desc' | 'asc'>('desc')
  const [hostname, setHostname] = useState(hostParam || '')
  const [agentId, setAgentId] = useState(agentParam || '')
  const [username, setUsername] = useState('')
  const [sourceIp, setSourceIp] = useState('')
  const [destinationIp, setDestinationIp] = useState('')
  const [eventCategory, setEventCategory] = useState('')
  const [severity, setSeverity] = useState('')
  const [search, setSearch] = useState('')

  // Modals
  const [selectedEvent, setSelectedEvent] = useState<any>(null)
  const [selectedRawLog, setSelectedRawLog] = useState<any>(null)
  const [fetchingRawLog, setFetchingRawLog] = useState(false)

  // Live real-time
  const [isLive, setIsLive] = useState(true)
  const { lastMessage, status: wsStatus } = useWebSocket()

  const calculateTimeBounds = useCallback((preset: TimePreset): { start?: string; end?: string } => {
    if (preset === 'all') return {}
    if (preset === 'custom') {
      return {
        start: customStart ? new Date(customStart).toISOString() : undefined,
        end: customEnd ? new Date(customEnd).toISOString() : undefined
      }
    }
    const now = new Date()
    const minutesMap: Record<string, number> = {
      '15m': 15,
      '30m': 30,
      '1h': 60,
      '6h': 360,
      '24h': 1440
    }
    const mins = minutesMap[preset] || 60
    const start = new Date(now.getTime() - mins * 60 * 1000)
    return {
      start: start.toISOString(),
      end: now.toISOString()
    }
  }, [customStart, customEnd])

  const fetchTimeline = useCallback(async () => {
    try {
      setLoading(true)
      const { start, end } = calculateTimeBounds(timePreset)
      const query: Record<string, any> = {
        page,
        page_size: pageSize,
        order
      }
      if (start) query.start_time = start
      if (end) query.end_time = end
      if (investigationIdParam) query.investigation_id = Number(investigationIdParam)
      if (alertIdParam) query.alert_id = alertIdParam
      if (hostname.trim()) query.hostname = hostname.trim()
      if (agentId.trim()) query.agent_id = Number(agentId.trim())
      if (username.trim()) query.username = username.trim()
      if (sourceIp.trim()) query.source_ip = sourceIp.trim()
      if (destinationIp.trim()) query.destination_ip = destinationIp.trim()
      if (eventCategory.trim()) query.event_category = eventCategory.trim()
      if (severity.trim()) query.severity = severity.trim()
      if (search.trim()) query.search = search.trim()

      const res = await api.get<any>('/attack-timeline', query)
      setItems(res.items || [])
      setTotal(res.total || 0)
      setError('')
    } catch (err: any) {
      setError(err.message || 'Failed to load attack timeline')
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [
    page,
    pageSize,
    order,
    timePreset,
    calculateTimeBounds,
    investigationIdParam,
    alertIdParam,
    hostname,
    agentId,
    username,
    sourceIp,
    destinationIp,
    eventCategory,
    severity,
    search
  ])

  useEffect(() => {
    fetchTimeline()
  }, [fetchTimeline])

  // WebSocket Live Updates
  useEffect(() => {
    if (!isLive || !lastMessage || lastMessage.type !== 'new_event') return
    const incoming = lastMessage.data
    if (!incoming || !incoming.event_id) return

    // Don't inject if context filters are applied that require backend evaluation
    if (investigationIdParam || alertIdParam) return

    setItems(prev => {
      if (prev.some(item => item.event_id === incoming.event_id)) return prev

      const formattedItem: TimelineItem = {
        id: incoming.id || Date.now(),
        event_id: incoming.event_id,
        timestamp: incoming.timestamp || new Date().toISOString(),
        received_at: incoming.received_at,
        event_type: incoming.event_type,
        event_category: incoming.event_category,
        severity: incoming.severity,
        hostname: incoming.hostname,
        agent_id: incoming.agent_id,
        host_id: incoming.host_id,
        username: incoming.username,
        source_ip: incoming.source_ip,
        source_port: incoming.source_port,
        destination_ip: incoming.destination_ip,
        destination_port: incoming.destination_port,
        protocol: incoming.protocol,
        action: incoming.action,
        source_type: incoming.source_type,
        raw_log_id: incoming.raw_log_id,
        metadata_: incoming.metadata_
      }

      if (order === 'desc') {
        const next = [formattedItem, ...prev]
        if (next.length > pageSize) next.pop()
        return next
      } else {
        const next = [...prev, formattedItem]
        if (next.length > pageSize) next.shift()
        return next
      }
    })
    setTotal(prev => prev + 1)
  }, [lastMessage, isLive, order, pageSize, investigationIdParam, alertIdParam])

  const handleOpenRawLog = async (rawLogId: number) => {
    try {
      setFetchingRawLog(true)
      const log = await api.get<any>(`/raw_logs/${rawLogId}`)
      setSelectedRawLog(log)
    } catch (err: any) {
      alert('Failed to load raw log: ' + err.message)
    } finally {
      setFetchingRawLog(false)
    }
  }

  const handleClearContext = () => {
    router.push('/attack-timeline')
  }

  const handleResetFilters = () => {
    setHostname('')
    setAgentId('')
    setUsername('')
    setSourceIp('')
    setDestinationIp('')
    setEventCategory('')
    setSeverity('')
    setSearch('')
    setTimePreset(investigationIdParam || alertIdParam ? 'all' : '1h')
    setCustomStart('')
    setCustomEnd('')
    setOrder('desc')
    setPage(1)
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-white tracking-wide">Attack Timeline</h1>
            <span
              className={`px-2 py-0.5 text-xs rounded-full border ${
                wsStatus === 'CONNECTED'
                  ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-400'
                  : 'bg-yellow-950/60 border-yellow-700/60 text-yellow-400'
              }`}
            >
              WS: {wsStatus}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Chronological evidence sequence and contextual activity view
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsLive(!isLive)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 border transition-colors ${
              isLive
                ? 'bg-emerald-900/30 border-emerald-600/50 text-emerald-400 hover:bg-emerald-900/50'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isLive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'
              }`}
            />
            <span>{isLive ? 'Live Stream Active' : 'Live Paused'}</span>
          </button>

          <button
            onClick={() => fetchTimeline()}
            className="px-3 py-1.5 rounded-lg bg-[#1e1e24] hover:bg-gray-800 border border-gray-700 text-gray-200 text-xs font-medium transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Context Banner */}
      {investigationIdParam && (
        <div className="bg-blue-950/40 border border-blue-800/60 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <span className="px-2 py-1 bg-blue-600 text-white text-xs font-semibold rounded">
              INV-{investigationIdParam}
            </span>
            <span className="text-sm text-blue-200">
              Filtered to Investigation evidence and correlated activity within time window.
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Link
              href={`/investigations/${investigationIdParam}`}
              className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded transition-colors"
            >
              Back to Investigation
            </Link>
            <button
              onClick={handleClearContext}
              className="text-xs text-gray-400 hover:text-white px-2 py-1.5"
            >
              Clear Context
            </button>
          </div>
        </div>
      )}

      {alertIdParam && (
        <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <span className="px-2 py-1 bg-amber-600 text-white text-xs font-semibold rounded">
              ALERT #{alertIdParam}
            </span>
            <span className="text-sm text-amber-200">
              Filtered to Alert triggering event and surrounding host/agent activity.
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Link
              href="/alerts"
              className="text-xs bg-amber-700 hover:bg-amber-600 text-white px-3 py-1.5 rounded transition-colors"
            >
              Back to Alerts
            </Link>
            <button
              onClick={handleClearContext}
              className="text-xs text-gray-400 hover:text-white px-2 py-1.5"
            >
              Clear Context
            </button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Top row: Time Presets & Sort Order */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800/80 pb-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-gray-400 font-semibold mr-1">Time Range:</span>
              {(['15m', '30m', '1h', '6h', '24h', 'all', 'custom'] as TimePreset[]).map(p => (
                <button
                  key={p}
                  onClick={() => {
                    setTimePreset(p)
                    setPage(1)
                  }}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    timePreset === p
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'bg-gray-800/80 text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {p === 'all' ? 'All Data' : p === 'custom' ? 'Custom...' : `Last ${p}`}
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-400 font-semibold">Order:</span>
              <select
                value={order}
                onChange={e => {
                  setOrder(e.target.value as 'desc' | 'asc')
                  setPage(1)
                }}
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none"
              >
                <option value="desc">Newest First (DESC)</option>
                <option value="asc">Chronological (ASC)</option>
              </select>
            </div>
          </div>

          {/* Custom Date Inputs if 'custom' preset is selected */}
          {timePreset === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-gray-950/60 rounded border border-gray-800">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Start Time (UTC / Local)</label>
                <input
                  type="datetime-local"
                  value={customStart}
                  onChange={e => {
                    setCustomStart(e.target.value)
                    setPage(1)
                  }}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">End Time (UTC / Local)</label>
                <input
                  type="datetime-local"
                  value={customEnd}
                  onChange={e => {
                    setCustomEnd(e.target.value)
                    setPage(1)
                  }}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-1.5 text-xs text-white"
                />
              </div>
            </div>
          )}

          {/* Grid Filters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="col-span-2">
              <label className="block text-[11px] text-gray-400 font-semibold mb-1">Search</label>
              <input
                type="text"
                value={search}
                onChange={e => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="User, host, IP, event type..."
                className="w-full bg-[#151518] border border-gray-800 rounded p-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] text-gray-400 font-semibold mb-1">Hostname</label>
              <input
                type="text"
                value={hostname}
                onChange={e => {
                  setHostname(e.target.value)
                  setPage(1)
                }}
                placeholder="e.g. dc-01"
                className="w-full bg-[#151518] border border-gray-800 rounded p-1.5 text-xs text-white placeholder-gray-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-gray-400 font-semibold mb-1">Agent ID</label>
              <input
                type="text"
                value={agentId}
                onChange={e => {
                  setAgentId(e.target.value)
                  setPage(1)
                }}
                placeholder="Numeric ID"
                className="w-full bg-[#151518] border border-gray-800 rounded p-1.5 text-xs text-white placeholder-gray-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-gray-400 font-semibold mb-1">Source IP</label>
              <input
                type="text"
                value={sourceIp}
                onChange={e => {
                  setSourceIp(e.target.value)
                  setPage(1)
                }}
                placeholder="192.168.x.x"
                className="w-full bg-[#151518] border border-gray-800 rounded p-1.5 text-xs text-white placeholder-gray-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-gray-400 font-semibold mb-1">Dest IP</label>
              <input
                type="text"
                value={destinationIp}
                onChange={e => {
                  setDestinationIp(e.target.value)
                  setPage(1)
                }}
                placeholder="10.0.x.x"
                className="w-full bg-[#151518] border border-gray-800 rounded p-1.5 text-xs text-white placeholder-gray-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-gray-400 font-semibold mb-1">Category</label>
              <input
                type="text"
                value={eventCategory}
                onChange={e => {
                  setEventCategory(e.target.value)
                  setPage(1)
                }}
                placeholder="auth, process..."
                className="w-full bg-[#151518] border border-gray-800 rounded p-1.5 text-xs text-white placeholder-gray-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-gray-400 font-semibold mb-1">Severity</label>
              <select
                value={severity}
                onChange={e => {
                  setSeverity(e.target.value)
                  setPage(1)
                }}
                className="w-full bg-[#151518] border border-gray-800 rounded p-1.5 text-xs text-white focus:outline-none"
              >
                <option value="">All</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
                <option value="INFO">INFO</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-800/50">
            <span>Showing {items.length} of {total} events</span>
            <button
              onClick={handleResetFilters}
              className="text-blue-400 hover:text-blue-300 font-medium"
            >
              Reset Filters
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Area */}
      {loading ? (
        <LoadingState message="Loading Attack Timeline..." />
      ) : error ? (
        <ErrorState message={error} retry={fetchTimeline} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No Timeline Events Found"
          description={
            investigationIdParam
              ? 'No timeline evidence is associated with this investigation for the selected criteria.'
              : alertIdParam
              ? 'No events match the selected alert context.'
              : 'No security events match the selected time range and filters.'
          }
        />
      ) : (
        <div className="relative pl-6 sm:pl-8 border-l border-gray-800/80 space-y-6">
          {items.map((item, idx) => {
            const dateObj = new Date(item.timestamp)
            const sev = (item.severity || 'INFO').toUpperCase()
            const dotColor =
              sev === 'CRITICAL'
                ? 'bg-red-500 ring-4 ring-red-950/80'
                : sev === 'HIGH'
                ? 'bg-orange-500 ring-4 ring-orange-950/80'
                : sev === 'MEDIUM'
                ? 'bg-amber-400 ring-4 ring-amber-950/80'
                : sev === 'LOW'
                ? 'bg-blue-400 ring-4 ring-blue-950/80'
                : 'bg-gray-400 ring-4 ring-gray-950/80'

            return (
              <div key={`${item.event_id}-${idx}`} className="relative group">
                {/* Severity dot on timeline line */}
                <div
                  className={`absolute -left-[31px] sm:-left-[39px] top-4 w-3.5 h-3.5 rounded-full ${dotColor} transition-transform group-hover:scale-125`}
                />

                {/* Timeline Item Card */}
                <div className="bg-[#151518] hover:bg-[#1a1a20] border border-gray-800/80 hover:border-gray-700/80 rounded-lg p-4 transition-colors shadow-sm">
                  {/* Top Bar of item: Timestamp, Event Type, Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono text-gray-400 font-semibold">
                        {dateObj.toLocaleDateString()} {dateObj.toLocaleTimeString()}
                      </span>

                      <span className="text-xs bg-gray-800 text-gray-200 px-2 py-0.5 rounded font-mono font-medium">
                        {item.event_type || 'Unknown Type'}
                      </span>

                      {item.event_category && (
                        <span className="text-xs text-gray-500 font-medium">
                          ({item.event_category})
                        </span>
                      )}

                      <SeverityBadge severity={item.severity || 'INFO'} />
                    </div>

                    {/* Context Badge if attached to investigation or alert */}
                    {item.context_type && (
                      <div className="flex items-center space-x-1.5">
                        {item.context_type === 'DIRECT_EVIDENCE' && (
                          <span className="text-[11px] font-semibold bg-blue-950/70 border border-blue-700/60 text-blue-300 px-2 py-0.5 rounded">
                            Direct Evidence
                          </span>
                        )}
                        {item.context_type === 'CORRELATED_CONTEXT' && (
                          <span className="text-[11px] font-semibold bg-purple-950/70 border border-purple-700/60 text-purple-300 px-2 py-0.5 rounded">
                            {item.context_reason || 'Correlated'}
                          </span>
                        )}
                        {item.context_type === 'ALERT_TRIGGER' && (
                          <span className="text-[11px] font-semibold bg-red-950/70 border border-red-700/60 text-red-300 px-2 py-0.5 rounded">
                            {item.context_reason || 'Alert Trigger'}
                          </span>
                        )}
                        {item.context_type === 'SURROUNDING_CONTEXT' && (
                          <span className="text-[11px] font-semibold bg-amber-950/70 border border-amber-700/60 text-amber-300 px-2 py-0.5 rounded">
                            Surrounding Activity
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Metadata Chips / Key Details */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-400 my-2 pt-2 border-t border-gray-800/40">
                    <div>
                      <span className="text-gray-500 font-semibold block text-[10px] uppercase">Host</span>
                      <span className="text-gray-200 font-medium truncate block">
                        {item.hostname || 'N/A'}
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-500 font-semibold block text-[10px] uppercase">Agent</span>
                      <span className="text-gray-200 font-medium truncate block">
                        {item.agent_id ? `Agent #${item.agent_id}` : 'N/A'}
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-500 font-semibold block text-[10px] uppercase">User</span>
                      <span className="text-gray-200 font-medium truncate block">
                        {item.username || 'N/A'}
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-500 font-semibold block text-[10px] uppercase">Network</span>
                      <span className="text-gray-200 font-mono text-[11px] truncate block">
                        {item.source_ip || item.destination_ip ? (
                          <>
                            {item.source_ip || '*'}{item.source_port ? `:${item.source_port}` : ''} → {item.destination_ip || '*'}{item.destination_port ? `:${item.destination_port}` : ''}
                          </>
                        ) : (
                          'N/A'
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Process Name or Command Line if available */}
                  {(item.process_name || item.command_line) && (
                    <div className="my-2 p-2 bg-gray-950/80 rounded border border-gray-800/60 text-xs font-mono">
                      {item.process_name && (
                        <div className="text-gray-300">
                          <span className="text-gray-500 select-none mr-2">Process:</span>
                          <span className="text-blue-300">{item.process_name}</span>
                        </div>
                      )}
                      {item.command_line && (
                        <div className="text-gray-400 mt-1 truncate">
                          <span className="text-gray-500 select-none mr-2">Cmd:</span>
                          <span>{item.command_line}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions / Traceability */}
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-800/40">
                    <span className="text-[11px] font-mono text-gray-500">
                      ID: {item.event_id}
                    </span>

                    <div className="flex items-center space-x-2">
                      {item.raw_log_id && (
                        <button
                          onClick={() => handleOpenRawLog(item.raw_log_id!)}
                          disabled={fetchingRawLog}
                          className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-2.5 py-1 rounded transition-colors"
                        >
                          Raw Log #{item.raw_log_id}
                        </button>
                      )}

                      <button
                        onClick={() => setSelectedEvent(item)}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1 rounded transition-colors"
                      >
                        Inspect Event
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && total > pageSize && (
        <div className="pt-4">
          <Pagination
            currentPage={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Event Details Modal */}
      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {/* Raw Log Details Modal */}
      {selectedRawLog && (
        <RawLogDetailsModal
          log={selectedRawLog}
          onClose={() => setSelectedRawLog(null)}
        />
      )}
    </div>
  )
}

export default function AttackTimelinePage() {
  return (
    <Suspense fallback={<LoadingState message="Loading Attack Timeline..." />}>
      <AttackTimelineContent />
    </Suspense>
  )
}
