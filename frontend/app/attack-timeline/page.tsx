"use client"

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Pagination } from '@/components/ui/Pagination'
import { EventDetailsModal } from '@/components/ui/EventDetailsModal'
import { AlertDetailsModal } from '@/components/ui/AlertDetailsModal'
import { RawLogDetailsModal } from '@/components/ui/RawLogDetailsModal'
import { useWebSocket } from '@/hooks/useWebSocket'

type TimePreset = '15m' | '30m' | '1h' | '6h' | '24h' | 'all' | 'custom'
type GroupByOption = 'none' | 'host' | 'category' | 'severity' | 'provenance'

interface TimelineItem {
  id: number
  event_id: string
  timestamp: string
  received_at?: string
  event_type?: string
  event_category?: string
  severity?: string
  hostname?: string
  operating_system?: string
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
  provenance?: string
  context_type?: string
  context_reason?: string
  alert_id?: string
  alert_title?: string
  alert_severity?: string
  investigation_id?: number
  investigation_title?: string
  investigation_status?: string
  related_event_count?: number
  related_event_ids?: number[]
  metadata_?: any
}

interface InvestigationInfo {
  id: number
  title: string
  status: string
  severity: string
  time_range_start?: string
  time_range_end?: string
  evidence_count: number
  correlated_count: number
}

interface SummaryMetrics {
  total_events: number
  direct_evidence_count: number
  correlated_count: number
  alerts_count: number
  unique_hosts: string[]
  unique_agents: number[]
  unique_users: string[]
  unique_source_ips: string[]
  unique_destination_ips: string[]
}

function AttackTimelineContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const investigationIdParam = searchParams.get('investigation_id')
  const alertIdParam = searchParams.get('alert_id')
  const hostParam = searchParams.get('hostname')
  const agentParam = searchParams.get('agent_id')

  const [items, setItems] = useState<TimelineItem[]>([])
  const [investigationInfo, setInvestigationInfo] = useState<InvestigationInfo | null>(null)
  const [summaryMetrics, setSummaryMetrics] = useState<SummaryMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(30)
  const [total, setTotal] = useState(0)

  // View & Grouping
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set())
  const [groupBy, setGroupBy] = useState<GroupByOption>('none')

  // Filters
  const [timePreset, setTimePreset] = useState<TimePreset>(investigationIdParam || alertIdParam ? 'all' : '1h')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [order, setOrder] = useState<'desc' | 'asc'>('desc')
  const [provenanceFilter, setProvenanceFilter] = useState<'ALL' | 'DIRECT_EVIDENCE' | 'CORRELATED_EVENT'>('ALL')
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
  const [selectedAlert, setSelectedAlert] = useState<any>(null)
  const [selectedRawLog, setSelectedRawLog] = useState<any>(null)
  const [fetchingDetails, setFetchingDetails] = useState(false)

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
      if (provenanceFilter !== 'ALL') query.provenance = provenanceFilter
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
      if (res.investigation_info) {
        setInvestigationInfo(res.investigation_info)
      } else {
        setInvestigationInfo(null)
      }
      if (res.summary) {
        setSummaryMetrics(res.summary)
      } else {
        setSummaryMetrics(null)
      }
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
    provenanceFilter,
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

    setItems(prev => {
      if (prev.some(item => item.event_id === incoming.event_id || item.id === incoming.id)) {
        return prev
      }

      let provenance = 'OTHER'
      let contextType = 'OTHER'
      let contextReason: string | undefined = undefined

      if (investigationIdParam && prev.length > 0) {
        const matchingReasons: string[] = []
        const hasMatchingHost = prev.some(item => item.hostname && item.hostname === incoming.hostname)
        const hasMatchingAgent = prev.some(item => item.agent_id && item.agent_id === incoming.agent_id)
        const hasMatchingSrcIp = prev.some(item => item.source_ip && item.source_ip === incoming.source_ip)
        const hasMatchingDstIp = prev.some(item => item.destination_ip && item.destination_ip === incoming.destination_ip)
        const hasMatchingUser = prev.some(item => item.username && item.username === incoming.username)

        if (hasMatchingHost) matchingReasons.push('Same host')
        if (hasMatchingAgent) matchingReasons.push('Same agent')
        if (hasMatchingSrcIp) matchingReasons.push('Same source IP')
        if (hasMatchingDstIp) matchingReasons.push('Same destination IP')
        if (hasMatchingUser) matchingReasons.push('Same username')

        if (matchingReasons.length === 0) {
          return prev
        }

        provenance = 'CORRELATED_EVENT'
        contextType = 'CORRELATED_EVENT'
        contextReason = matchingReasons.join(' + ')
      }

      if (provenanceFilter === 'DIRECT_EVIDENCE') {
        return prev
      }

      const formattedItem: TimelineItem = {
        id: incoming.id || Date.now(),
        event_id: incoming.event_id,
        timestamp: incoming.timestamp || new Date().toISOString(),
        received_at: incoming.received_at,
        event_type: incoming.event_type,
        event_category: incoming.event_category,
        severity: incoming.severity,
        hostname: incoming.hostname,
        operating_system: incoming.operating_system,
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
        provenance,
        context_type: contextType,
        context_reason: contextReason,
        investigation_id: investigationIdParam ? Number(investigationIdParam) : undefined,
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
  }, [lastMessage, isLive, order, pageSize, investigationIdParam, provenanceFilter])

  const toggleExpand = (id: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedItems(new Set(items.map(i => i.id)))
  }

  const collapseAll = () => {
    setExpandedItems(new Set())
  }

  const handleOpenRawLog = async (rawLogId: number) => {
    try {
      setFetchingDetails(true)
      const log = await api.get<any>(`/raw_logs/${rawLogId}`)
      setSelectedRawLog(log)
    } catch (err: any) {
      alert('Failed to load raw log: ' + err.message)
    } finally {
      setFetchingDetails(false)
    }
  }

  const handleOpenAlert = async (alertRef: string) => {
    try {
      setFetchingDetails(true)
      const alertData = await api.get<any>(`/alerts/${alertRef}`)
      setSelectedAlert(alertData)
    } catch (err: any) {
      alert('Failed to load alert details: ' + err.message)
    } finally {
      setFetchingDetails(false)
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
    setProvenanceFilter('ALL')
    setTimePreset(investigationIdParam || alertIdParam ? 'all' : '1h')
    setCustomStart('')
    setCustomEnd('')
    setOrder('desc')
    setGroupBy('none')
    setPage(1)
  }

  // Grouped items calculation
  const groupedSections = useMemo(() => {
    if (groupBy === 'none') {
      return [{ groupTitle: 'Chronological Stream', groupItems: items }]
    }

    const groups: Record<string, TimelineItem[]> = {}
    items.forEach(item => {
      let key = 'Other'
      if (groupBy === 'host') {
        key = item.hostname || 'Unknown Host'
      } else if (groupBy === 'category') {
        key = item.event_category || 'Uncategorized'
      } else if (groupBy === 'severity') {
        key = item.severity || 'INFO'
      } else if (groupBy === 'provenance') {
        key = item.provenance === 'DIRECT_EVIDENCE'
          ? 'Direct Evidence'
          : item.provenance === 'CORRELATED_EVENT'
          ? 'Correlated Context'
          : item.provenance === 'ALERT_CONTEXT'
          ? 'Alert Trigger'
          : 'Other Events'
      }

      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    })

    return Object.entries(groups).map(([groupTitle, groupItems]) => ({
      groupTitle,
      groupItems
    }))
  }, [items, groupBy])

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
            Chronological evidence sequence and deterministic correlation workspace
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

      {/* Investigation Context Header */}
      {investigationInfo && (
        <div className="bg-[#131b2e] border border-blue-900/70 rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-blue-950 pb-4">
            <div>
              <div className="flex items-center space-x-3">
                <span className="px-2.5 py-1 bg-blue-600 text-white text-xs font-bold rounded">
                  INV-{investigationInfo.id}
                </span>
                <h2 className="text-lg font-bold text-white tracking-wide">
                  {investigationInfo.title}
                </h2>
                <StatusBadge status={investigationInfo.status} />
                <SeverityBadge severity={investigationInfo.severity} />
              </div>
              <p className="text-xs text-blue-300/80 mt-1.5">
                Deterministic Investigation Timeline — Visualizing direct evidence & correlated events
              </p>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <Link
                href={`/investigations/${investigationInfo.id}`}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center space-x-1.5"
              >
                <span>← Back to Investigation</span>
              </Link>
              <button
                onClick={handleClearContext}
                className="text-xs text-gray-400 hover:text-white px-2 py-2"
              >
                Clear Filter
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-[#0b101d] p-3 rounded-lg border border-blue-950">
              <span className="text-gray-400 block text-[11px] uppercase font-semibold">Direct Evidence</span>
              <span className="text-lg font-bold text-blue-400 mt-0.5 block">
                {investigationInfo.evidence_count} items
              </span>
            </div>

            <div className="bg-[#0b101d] p-3 rounded-lg border border-blue-950">
              <span className="text-gray-400 block text-[11px] uppercase font-semibold">Correlated Events</span>
              <span className="text-lg font-bold text-purple-400 mt-0.5 block">
                {investigationInfo.correlated_count} events
              </span>
            </div>

            <div className="col-span-2 bg-[#0b101d] p-3 rounded-lg border border-blue-950">
              <span className="text-gray-400 block text-[11px] uppercase font-semibold">Timeline Window</span>
              <span className="text-xs text-gray-300 font-mono mt-1 block truncate">
                {investigationInfo.time_range_start && investigationInfo.time_range_end ? (
                  <>
                    {new Date(investigationInfo.time_range_start).toLocaleString()} → {new Date(investigationInfo.time_range_end).toLocaleString()}
                  </>
                ) : (
                  'All recorded evidence time range'
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Alert Context Banner */}
      {alertIdParam && !investigationInfo && (
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

      {/* Timeline Summary & Host/User Context Card */}
      {summaryMetrics && (
        <div className="bg-[#12141a] border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Timeline Dataset Summary
            </span>
            <span className="text-xs text-gray-500">
              {summaryMetrics.total_events} events matched
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-xs">
            <div className="bg-gray-900/80 p-2 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block uppercase">Total Events</span>
              <span className="text-sm font-bold text-gray-200">{summaryMetrics.total_events}</span>
            </div>
            <div className="bg-gray-900/80 p-2 rounded border border-gray-800">
              <span className="text-[10px] text-blue-400 block uppercase">Direct Evidence</span>
              <span className="text-sm font-bold text-blue-400">{summaryMetrics.direct_evidence_count}</span>
            </div>
            <div className="bg-gray-900/80 p-2 rounded border border-gray-800">
              <span className="text-[10px] text-purple-400 block uppercase">Correlated</span>
              <span className="text-sm font-bold text-purple-400">{summaryMetrics.correlated_count}</span>
            </div>
            <div className="bg-gray-900/80 p-2 rounded border border-gray-800">
              <span className="text-[10px] text-red-400 block uppercase">Alerts</span>
              <span className="text-sm font-bold text-red-400">{summaryMetrics.alerts_count}</span>
            </div>
            <div className="bg-gray-900/80 p-2 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block uppercase">Hosts</span>
              <span className="text-sm font-bold text-gray-200">{summaryMetrics.unique_hosts.length}</span>
            </div>
            <div className="bg-gray-900/80 p-2 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block uppercase">Agents</span>
              <span className="text-sm font-bold text-gray-200">{summaryMetrics.unique_agents.length}</span>
            </div>
            <div className="bg-gray-900/80 p-2 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block uppercase">Users</span>
              <span className="text-sm font-bold text-gray-200">{summaryMetrics.unique_users.length}</span>
            </div>
            <div className="bg-gray-900/80 p-2 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block uppercase">Unique IPs</span>
              <span className="text-sm font-bold text-gray-200">
                {summaryMetrics.unique_source_ips.length + summaryMetrics.unique_destination_ips.length}
              </span>
            </div>
          </div>

          {/* Quick Filter Context Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            {summaryMetrics.unique_hosts.length > 0 && (
              <div className="flex items-center space-x-1.5 flex-wrap">
                <span className="text-[10px] text-gray-500 uppercase font-semibold">Hosts:</span>
                {summaryMetrics.unique_hosts.slice(0, 4).map(h => (
                  <button
                    key={h}
                    onClick={() => {
                      setHostname(h)
                      setPage(1)
                    }}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-0.5 rounded text-[11px] font-mono border border-gray-700"
                    title={`Filter by host ${h}`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}

            {summaryMetrics.unique_users.length > 0 && (
              <div className="flex items-center space-x-1.5 flex-wrap ml-3">
                <span className="text-[10px] text-gray-500 uppercase font-semibold">Users:</span>
                {summaryMetrics.unique_users.slice(0, 3).map(u => (
                  <button
                    key={u}
                    onClick={() => {
                      setUsername(u)
                      setPage(1)
                    }}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-0.5 rounded text-[11px] border border-gray-700"
                    title={`Filter by user ${u}`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Provenance Filter Tabs & Group By Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800/80 pb-3">
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-400 font-semibold mr-1">Provenance:</span>
              <div className="inline-flex rounded-lg bg-gray-900 p-0.5 border border-gray-800">
                <button
                  onClick={() => {
                    setProvenanceFilter('ALL')
                    setPage(1)
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    provenanceFilter === 'ALL'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  All Activity
                </button>
                <button
                  onClick={() => {
                    setProvenanceFilter('DIRECT_EVIDENCE')
                    setPage(1)
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    provenanceFilter === 'DIRECT_EVIDENCE'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Direct Evidence {investigationInfo ? `(${investigationInfo.evidence_count})` : ''}
                </button>
                <button
                  onClick={() => {
                    setProvenanceFilter('CORRELATED_EVENT')
                    setPage(1)
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    provenanceFilter === 'CORRELATED_EVENT'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Correlated Context {investigationInfo ? `(${investigationInfo.correlated_count})` : ''}
                </button>
              </div>
            </div>

            {/* View options: Grouping, Order, Expand all */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-400 font-semibold">Group By:</span>
                <select
                  value={groupBy}
                  onChange={e => setGroupBy(e.target.value as GroupByOption)}
                  className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none"
                >
                  <option value="none">None (Timeline Flow)</option>
                  <option value="host">Host</option>
                  <option value="category">Category</option>
                  <option value="severity">Severity</option>
                  <option value="provenance">Provenance</option>
                </select>
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

              <div className="flex items-center space-x-1.5 border-l border-gray-800 pl-3">
                <button
                  onClick={expandAll}
                  className="text-[11px] text-gray-400 hover:text-white bg-gray-900 px-2 py-1 rounded border border-gray-800"
                >
                  Expand All
                </button>
                <button
                  onClick={collapseAll}
                  className="text-[11px] text-gray-400 hover:text-white bg-gray-900 px-2 py-1 rounded border border-gray-800"
                >
                  Collapse All
                </button>
              </div>
            </div>
          </div>

          {/* Time Presets Row */}
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
                  {p === 'all' ? 'All Data' : p === 'custom' ? 'Custom...' : `±${p}`}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Inputs */}
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

      {/* Main Timeline Stream */}
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
        <div className="space-y-8">
          {groupedSections.map((section, sIdx) => (
            <div key={section.groupTitle || sIdx} className="space-y-4">
              {groupBy !== 'none' && (
                <div className="flex items-center space-x-3 pb-2 border-b border-gray-800">
                  <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
                    {section.groupTitle}
                  </h3>
                  <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                    {section.groupItems.length}
                  </span>
                </div>
              )}

              {/* Vertical Chronological Connector Line */}
              <div className="relative pl-6 sm:pl-8 border-l-2 border-gray-800 space-y-6">
                {section.groupItems.map((item, idx) => {
                  const dateObj = new Date(item.timestamp)
                  const sev = (item.severity || 'INFO').toUpperCase()
                  const isDirect = item.provenance === 'DIRECT_EVIDENCE'
                  const isCorrelated = item.provenance === 'CORRELATED_EVENT'
                  const isExpanded = expandedItems.has(item.id)

                  const dotColor = isDirect
                    ? 'bg-blue-400 ring-4 ring-blue-950 shadow-md shadow-blue-500/30'
                    : isCorrelated
                    ? 'bg-purple-400 ring-4 ring-purple-950 shadow-md shadow-purple-500/20'
                    : sev === 'CRITICAL'
                    ? 'bg-red-500 ring-4 ring-red-950/80'
                    : sev === 'HIGH'
                    ? 'bg-orange-500 ring-4 ring-orange-950/80'
                    : sev === 'MEDIUM'
                    ? 'bg-amber-400 ring-4 ring-amber-950/80'
                    : 'bg-gray-400 ring-4 ring-gray-950/80'

                  const cardClasses = isDirect
                    ? 'bg-[#121929] border-l-4 border-l-blue-500 border-blue-900/60 shadow-md'
                    : isCorrelated
                    ? 'bg-[#171424] border-l-4 border-l-purple-500 border-purple-900/40'
                    : 'bg-[#151518] border-gray-800/80'

                  return (
                    <div key={`${item.event_id}-${idx}`} className="relative group">
                      {/* Chronological Connector Node */}
                      <div
                        className={`absolute -left-[31px] sm:-left-[39px] top-4 w-3.5 h-3.5 rounded-full ${dotColor} transition-transform group-hover:scale-125 z-10`}
                      />

                      {/* Timeline Card */}
                      <div className={`rounded-lg p-4 border transition-colors ${cardClasses}`}>
                        {/* Alert Marker Banner if associated with an alert */}
                        {item.alert_id && (
                          <div className="mb-3 p-2.5 bg-red-950/50 border border-red-800/70 rounded flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center space-x-2">
                              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                              <span className="text-xs font-bold text-red-300">
                                ALERT: {item.alert_title || `Alert #${item.alert_id}`}
                              </span>
                              {item.alert_severity && (
                                <SeverityBadge severity={item.alert_severity} />
                              )}
                            </div>

                            <button
                              onClick={() => handleOpenAlert(item.alert_id!)}
                              disabled={fetchingDetails}
                              className="text-xs bg-red-900/80 hover:bg-red-800 text-white font-medium px-2.5 py-1 rounded transition-colors"
                            >
                              View Alert Details
                            </button>
                          </div>
                        )}

                        {/* Card Header: Timestamp, Event Type, Badges */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-mono text-gray-300 font-semibold">
                              {dateObj.toLocaleDateString()} {dateObj.toLocaleTimeString()}
                            </span>

                            <span className="text-xs bg-gray-900 text-gray-200 px-2 py-0.5 rounded font-mono font-medium border border-gray-800">
                              {item.event_type || 'Unknown Type'}
                            </span>

                            {item.event_category && (
                              <span className="text-xs text-gray-500 font-medium">
                                ({item.event_category})
                              </span>
                            )}

                            <SeverityBadge severity={item.severity || 'INFO'} />
                          </div>

                          {/* Provenance Badge */}
                          <div className="flex items-center space-x-2">
                            {isDirect ? (
                              <span className="text-[11px] font-bold bg-blue-600 text-white px-2.5 py-0.5 rounded shadow-sm flex items-center space-x-1">
                                <span>DIRECT EVIDENCE</span>
                              </span>
                            ) : isCorrelated ? (
                              <span className="text-[11px] font-bold bg-purple-950/90 border border-purple-600/70 text-purple-300 px-2.5 py-0.5 rounded flex items-center space-x-1">
                                <span>CORRELATED CONTEXT</span>
                              </span>
                            ) : item.provenance === 'ALERT_CONTEXT' ? (
                              <span className="text-[11px] font-bold bg-red-950/90 border border-red-600/70 text-red-300 px-2.5 py-0.5 rounded">
                                ALERT TRIGGER
                              </span>
                            ) : null}

                            <button
                              onClick={() => toggleExpand(item.id)}
                              className="text-xs text-gray-400 hover:text-white px-1.5 py-0.5 rounded bg-gray-900/60 border border-gray-800"
                              aria-expanded={isExpanded}
                              aria-label="Toggle details expansion"
                            >
                              {isExpanded ? 'Collapse' : 'Expand'}
                            </button>
                          </div>
                        </div>

                        {/* Correlation Reason Display */}
                        {item.context_reason && (
                          <div className="text-xs my-2 px-2.5 py-1 rounded bg-black/40 border border-gray-800/80 flex items-center space-x-2">
                            <span className="text-gray-500 font-semibold text-[10px] uppercase">Reason:</span>
                            <span className={isDirect ? 'text-blue-300 font-medium' : 'text-purple-300 font-medium'}>
                              {item.context_reason}
                            </span>
                          </div>
                        )}

                        {/* Key Attributes Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-400 my-2 pt-2 border-t border-gray-800/40">
                          <div>
                            <span className="text-gray-500 font-semibold block text-[10px] uppercase">Host / OS</span>
                            <span className="text-gray-200 font-medium truncate block">
                              {item.hostname ? (
                                <Link href={`/hosts?search=${item.hostname}`} className="text-blue-400 hover:underline">
                                  {item.hostname}
                                </Link>
                              ) : (
                                'N/A'
                              )}
                              {item.operating_system ? ` (${item.operating_system})` : ''}
                            </span>
                          </div>

                          <div>
                            <span className="text-gray-500 font-semibold block text-[10px] uppercase">Agent</span>
                            <span className="text-gray-200 font-medium truncate block">
                              {item.agent_id ? (
                                <Link href={`/agents?search=${item.agent_id}`} className="text-blue-400 hover:underline">
                                  Agent #{item.agent_id}
                                </Link>
                              ) : (
                                'N/A'
                              )}
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

                        {/* Process Name or Command Line preview */}
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

                        {/* Expanded Inline Detail Panel (Section 6 & Phase 7D-4 Relationship Panel) */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-gray-800 space-y-3 bg-[#0d0f14] p-3 rounded-lg border border-gray-800/80">
                            {/* Relationship Panel (Phase 7D-4) */}
                            <div className="bg-[#10141d] p-3.5 rounded-lg border border-gray-800/90 space-y-2.5">
                              <span className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center space-x-2">
                                <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                                <span>Evidence Relationships & Navigation</span>
                              </span>

                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
                                {/* SOURCE */}
                                <div className="bg-black/40 p-2.5 rounded border border-gray-800/70 flex flex-col justify-between">
                                  <div>
                                    <span className="text-gray-500 block text-[10px] uppercase font-semibold">SOURCE</span>
                                    <span className="text-gray-200 font-mono text-[11px] block mt-0.5 truncate">
                                      Event #{item.id}
                                    </span>
                                  </div>
                                  <div className="mt-2">
                                    <button
                                      onClick={() => setSelectedEvent(item)}
                                      className="text-[11px] bg-blue-600/80 hover:bg-blue-600 text-white px-2 py-0.5 rounded transition-colors font-medium"
                                    >
                                      View Event
                                    </button>
                                  </div>
                                </div>

                                {/* ALERT */}
                                <div className="bg-black/40 p-2.5 rounded border border-gray-800/70 flex flex-col justify-between">
                                  <div>
                                    <span className="text-gray-500 block text-[10px] uppercase font-semibold">ALERT</span>
                                    {item.alert_id ? (
                                      <div>
                                        <span className="text-red-300 font-medium block mt-0.5 truncate">
                                          {item.alert_title || `Alert #${item.alert_id}`}
                                        </span>
                                        {item.alert_severity && (
                                          <span className="inline-block mt-1">
                                            <SeverityBadge severity={item.alert_severity} />
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-gray-500 italic block mt-0.5">No alert associated with this event</span>
                                    )}
                                  </div>
                                  {item.alert_id && (
                                    <div className="mt-2">
                                      <button
                                        onClick={() => handleOpenAlert(item.alert_id!)}
                                        disabled={fetchingDetails}
                                        className="text-[11px] bg-red-900/60 hover:bg-red-800 text-red-200 px-2 py-0.5 rounded transition-colors font-medium border border-red-800/50"
                                      >
                                        View Alert
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* RAW EVIDENCE */}
                                <div className="bg-black/40 p-2.5 rounded border border-gray-800/70 flex flex-col justify-between">
                                  <div>
                                    <span className="text-gray-500 block text-[10px] uppercase font-semibold">RAW EVIDENCE</span>
                                    {item.raw_log_id ? (
                                      <span className="text-yellow-400 font-mono text-[11px] block mt-0.5">
                                        Raw Log #{item.raw_log_id}
                                      </span>
                                    ) : (
                                      <span className="text-gray-500 italic block mt-0.5">No raw log available</span>
                                    )}
                                  </div>
                                  {item.raw_log_id && (
                                    <div className="mt-2">
                                      <button
                                        onClick={() => handleOpenRawLog(item.raw_log_id!)}
                                        disabled={fetchingDetails}
                                        className="text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-200 px-2 py-0.5 rounded transition-colors font-medium border border-gray-700"
                                      >
                                        View Raw Log
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* INVESTIGATION */}
                                <div className="bg-black/40 p-2.5 rounded border border-gray-800/70 flex flex-col justify-between">
                                  <div>
                                    <span className="text-gray-500 block text-[10px] uppercase font-semibold">INVESTIGATION</span>
                                    {item.investigation_id ? (
                                      <div>
                                        <span className="text-blue-300 font-medium block mt-0.5 truncate">
                                          {item.investigation_title || `Investigation #${item.investigation_id}`}
                                        </span>
                                        {item.investigation_status && (
                                          <span className="inline-block mt-1">
                                            <StatusBadge status={item.investigation_status} />
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-gray-500 italic block mt-0.5">No investigation relationship</span>
                                    )}
                                  </div>
                                  {item.investigation_id && (
                                    <div className="mt-2">
                                      <Link
                                        href={`/investigations/${item.investigation_id}`}
                                        className="text-[11px] bg-blue-900/60 hover:bg-blue-800 text-blue-200 px-2 py-0.5 rounded transition-colors font-medium border border-blue-800/50 inline-block"
                                      >
                                        View Investigation
                                      </Link>
                                    </div>
                                  )}
                                </div>

                                {/* HOST */}
                                <div className="bg-black/40 p-2.5 rounded border border-gray-800/70 flex flex-col justify-between">
                                  <div>
                                    <span className="text-gray-500 block text-[10px] uppercase font-semibold">HOST</span>
                                    {item.hostname ? (
                                      <div>
                                        <span className="text-gray-200 font-medium block mt-0.5 truncate">
                                          {item.hostname}
                                        </span>
                                        {item.operating_system && (
                                          <span className="text-gray-400 text-[10px] block capitalize">
                                            OS: {item.operating_system}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-gray-500 italic block mt-0.5">Host information unavailable</span>
                                    )}
                                  </div>
                                  {item.hostname && (
                                    <div className="mt-2">
                                      <Link
                                        href={`/hosts?search=${encodeURIComponent(item.hostname)}`}
                                        className="text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-200 px-2 py-0.5 rounded transition-colors font-medium border border-gray-700 inline-block"
                                      >
                                        View Host
                                      </Link>
                                    </div>
                                  )}
                                </div>

                                {/* AGENT */}
                                <div className="bg-black/40 p-2.5 rounded border border-gray-800/70 flex flex-col justify-between">
                                  <div>
                                    <span className="text-gray-500 block text-[10px] uppercase font-semibold">AGENT</span>
                                    {item.agent_id ? (
                                      <span className="text-gray-200 font-mono text-[11px] block mt-0.5">
                                        Agent #{item.agent_id}
                                      </span>
                                    ) : (
                                      <span className="text-gray-500 italic block mt-0.5">No agent linked</span>
                                    )}
                                  </div>
                                  {item.agent_id && (
                                    <div className="mt-2">
                                      <Link
                                        href={`/agents?search=${item.agent_id}`}
                                        className="text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-200 px-2 py-0.5 rounded transition-colors font-medium border border-gray-700 inline-block"
                                      >
                                        View Agent
                                      </Link>
                                    </div>
                                  )}
                                </div>

                                {/* CORRELATED EVENTS */}
                                <div className="bg-black/40 p-2.5 rounded border border-gray-800/70 sm:col-span-2 md:col-span-3">
                                  <span className="text-gray-500 block text-[10px] uppercase font-semibold">CORRELATED CONTEXT</span>
                                  {item.context_reason ? (
                                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-center space-x-2">
                                        <span className="text-purple-300 font-medium">
                                          {item.context_reason}
                                        </span>
                                        {item.related_event_count !== undefined && item.related_event_count !== null && item.related_event_count > 0 && (
                                          <span className="bg-purple-950 border border-purple-800 text-purple-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
                                            {item.related_event_count} related events
                                          </span>
                                        )}
                                      </div>
                                      {item.hostname && (
                                        <Link
                                          href={`/attack-timeline?hostname=${encodeURIComponent(item.hostname)}`}
                                          className="text-[11px] text-purple-400 hover:underline"
                                        >
                                          Filter host timeline →
                                        </Link>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-500 italic block mt-0.5">No correlated events</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                              Detailed Evidence Context
                            </span>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                              <div>
                                <span className="text-gray-500 block text-[10px] uppercase">Event ID</span>
                                <span className="text-gray-200 font-mono text-[11px] break-all">{item.event_id}</span>
                              </div>
                              <div>
                                <span className="text-gray-500 block text-[10px] uppercase">Action / Protocol</span>
                                <span className="text-gray-200">{item.action || 'N/A'} {item.protocol ? `(${item.protocol})` : ''}</span>
                              </div>
                              <div>
                                <span className="text-gray-500 block text-[10px] uppercase">Source Type</span>
                                <span className="text-gray-200">{item.source_type || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="text-gray-500 block text-[10px] uppercase">Received At</span>
                                <span className="text-gray-200 font-mono text-[11px]">
                                  {item.received_at ? new Date(item.received_at).toLocaleTimeString() : 'N/A'}
                                </span>
                              </div>
                            </div>

                            {item.command_line && (
                              <div>
                                <span className="text-gray-500 block text-[10px] uppercase mb-1">Full Command Line</span>
                                <div className="bg-black/60 p-2 rounded border border-gray-800 text-xs font-mono text-gray-300 break-all select-all">
                                  {item.command_line}
                                </div>
                              </div>
                            )}

                            {item.metadata_ && Object.keys(item.metadata_).length > 0 && (
                              <div>
                                <span className="text-gray-500 block text-[10px] uppercase mb-1">Event Metadata</span>
                                <div className="bg-black/60 p-2 rounded border border-gray-800 text-xs font-mono text-gray-300 max-h-48 overflow-y-auto">
                                  <pre>{JSON.stringify(item.metadata_, null, 2)}</pre>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Footer / Traceability Actions */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2 border-t border-gray-800/40">
                          <span className="text-[11px] font-mono text-gray-500">
                            ID: {item.event_id}
                          </span>

                          <div className="flex items-center space-x-2">
                            {/* Raw Log Traceability */}
                            {item.raw_log_id && (
                              <button
                                onClick={() => handleOpenRawLog(item.raw_log_id!)}
                                disabled={fetchingDetails}
                                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-2.5 py-1 rounded transition-colors"
                              >
                                Raw Log #{item.raw_log_id}
                              </button>
                            )}

                            {/* Inspect Event Modal */}
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
            </div>
          ))}
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

      {/* Alert Details Modal */}
      {selectedAlert && (
        <AlertDetailsModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
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
