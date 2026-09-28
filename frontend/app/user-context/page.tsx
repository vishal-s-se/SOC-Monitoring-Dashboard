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

type ActiveTab = 'events' | 'alerts' | 'hosts' | 'source-ips' | 'dest-ips' | 'investigations' | 'activity'

function UserContextContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const userParam = searchParams.get('user') || ''

  const [inputUser, setInputUser] = useState(userParam)
  const [activeUser, setActiveUser] = useState(userParam)

  const [overview, setOverview] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [activeTab, setActiveTab] = useState<ActiveTab>('events')

  const [events, setEvents] = useState<any[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsPage, setEventsPage] = useState(1)
  const [eventsTotal, setEventsTotal] = useState(0)
  const [eventCategoryFilter, setEventCategoryFilter] = useState('')

  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)
  const [selectedAlert, setSelectedAlert] = useState<any | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (activeUser) params.set('user', activeUser)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `/user-context?${qs}` : '/user-context')
  }, [activeUser])

  const loadOverview = useCallback(async () => {
    if (!activeUser) return
    setLoading(true)
    setError('')
    try {
      const data = await api.get<any>(`/user-context/${encodeURIComponent(activeUser)}`)
      setOverview(data)
    } catch (e: any) {
      if (e?.status === 404) {
        setError(`No activity found for username "${activeUser}". This username has not been observed in any events.`)
      } else {
        setError(e?.message || 'Failed to load user context')
      }
      setOverview(null)
    } finally {
      setLoading(false)
    }
  }, [activeUser])

  const loadEvents = useCallback(async () => {
    if (!activeUser) return
    setEventsLoading(true)
    try {
      const params: Record<string, any> = { page: eventsPage, page_size: 50 }
      if (eventCategoryFilter) params.event_category = eventCategoryFilter
      const data = await api.get<any>(`/user-context/${encodeURIComponent(activeUser)}/events`, params)
      setEvents(data.items || [])
      setEventsTotal(data.total || 0)
    } catch {
      setEvents([])
    } finally {
      setEventsLoading(false)
    }
  }, [activeUser, eventsPage, eventCategoryFilter])

  useEffect(() => { loadOverview() }, [loadOverview])
  useEffect(() => {
    if (activeTab === 'events') loadEvents()
  }, [activeTab, loadEvents])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setActiveUser(inputUser.trim())
    setEventsPage(1)
    setActiveTab('events')
  }

  const summaryCards = overview ? [
    { label: 'Total Events', value: overview.summary.total_events },
    { label: 'Hosts', value: overview.summary.hosts_count },
    { label: 'Source IPs', value: overview.summary.source_ips_count },
    { label: 'Destination IPs', value: overview.summary.destination_ips_count },
    { label: 'Alerts', value: overview.summary.alerts_count },
    { label: 'Investigations', value: overview.summary.investigations_count },
  ] : []

  const tabs: { id: ActiveTab; label: string; count?: number }[] = [
    { id: 'events', label: 'Events', count: eventsTotal || overview?.summary?.total_events },
    { id: 'alerts', label: 'Alerts', count: overview?.summary?.alerts_count },
    { id: 'hosts', label: 'Hosts', count: overview?.summary?.hosts_count },
    { id: 'source-ips', label: 'Source IPs', count: overview?.summary?.source_ips_count },
    { id: 'dest-ips', label: 'Destination IPs', count: overview?.summary?.destination_ips_count },
    { id: 'investigations', label: 'Investigations', count: overview?.summary?.investigations_count },
    { id: 'activity', label: 'Activity Breakdown' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">User Context</h1>
          <p className="text-sm text-gray-400 mt-1">Observed activity context for a username across all SOC telemetry</p>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent>
          <form onSubmit={handleSearch} className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Username</label>
              <input
                type="text"
                value={inputUser}
                onChange={e => setInputUser(e.target.value)}
                placeholder="Enter a username observed in events..."
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              className="mt-5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            >
              Investigate
            </button>
            {activeUser && (
              <button
                type="button"
                onClick={() => { setInputUser(''); setActiveUser(''); setOverview(null); setError('') }}
                className="mt-5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors"
              >
                Clear
              </button>
            )}
          </form>
        </CardContent>
      </Card>

      {!activeUser && (
        <EmptyState title="Enter a username above to view observed context" description="" />
      )}

      {activeUser && loading && <LoadingState message="Loading user context..." />}
      {activeUser && !loading && error && <ErrorState message={error} />}

      {activeUser && !loading && overview && (
        <>
          {/* Identity Banner */}
          <Card>
            <CardContent>
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-2xl font-bold text-white font-mono">{overview.summary.username}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-400 flex-wrap">
                    {overview.summary.first_observed && (
                      <span>First Observed: <span className="text-gray-200">{new Date(overview.summary.first_observed).toLocaleString()}</span></span>
                    )}
                    {overview.summary.last_observed && (
                      <span>Last Observed: <span className="text-gray-200">{new Date(overview.summary.last_observed).toLocaleString()}</span></span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/attack-timeline?search=${encodeURIComponent(activeUser)}`}
                  className="text-xs bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded transition-colors"
                >
                  View in Timeline
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {summaryCards.map(card => (
              <Card key={card.label}>
                <CardContent>
                  <p className="text-xs text-gray-400 uppercase">{card.label}</p>
                  <p className="text-2xl font-bold text-white mt-1">{card.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-800">
            <nav className="flex -mb-px space-x-6 overflow-x-auto">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                  {tab.count != null && tab.count > 0 && (
                    <span className="ml-2 text-xs bg-gray-700 text-gray-300 rounded-full px-2 py-0.5">{tab.count}</span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab: Events */}
          {activeTab === 'events' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <select
                  value={eventCategoryFilter}
                  onChange={e => { setEventCategoryFilter(e.target.value); setEventsPage(1) }}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200"
                >
                  <option value="">All Categories</option>
                  {overview.activity_breakdown.map((a: any) => (
                    <option key={a.event_category} value={a.event_category}>{a.event_category} ({a.event_count})</option>
                  ))}
                </select>
              </div>
              {eventsLoading ? <LoadingState message="Loading events..." /> : (
                <>
                  <DataTable
                    data={events}
                    keyExtractor={e => String(e.id)}
                    columns={[
                      { key: 'Timestamp', title: 'Timestamp', render: e => new Date(e.timestamp).toLocaleString() },
                      { key: 'Type', title: 'Type', render: e => <span className="text-gray-200 text-xs">{e.event_type || '—'}</span> },
                      { key: 'Category', title: 'Category', render: e => <span className="text-gray-300 text-xs">{e.event_category || '—'}</span> },
                      { key: 'Host', title: 'Host', render: e => e.hostname ? (
                        <Link href={`/host-investigation?host=${encodeURIComponent(e.hostname)}`} className="text-blue-400 hover:underline text-xs">{e.hostname}</Link>
                      ) : '—' },
                      { key: 'Src IP', title: 'Src IP', render: e => e.source_ip ? (
                        <Link href={`/ip-investigation?ip=${encodeURIComponent(e.source_ip)}`} className="text-blue-400 hover:underline text-xs font-mono">{e.source_ip}</Link>
                      ) : '—' },
                      { key: 'Dst IP', title: 'Dst IP', render: e => e.destination_ip ? (
                        <Link href={`/ip-investigation?ip=${encodeURIComponent(e.destination_ip)}`} className="text-blue-400 hover:underline text-xs font-mono">{e.destination_ip}</Link>
                      ) : '—' },
                      { key: 'Severity', title: 'Severity', render: e => <SeverityBadge severity={e.severity || 'INFO'} /> },
                      { key: '', title: '', render: e => (
                        <button onClick={() => setSelectedEvent(e)} className="text-xs text-blue-400 hover:underline">Details</button>
                      )},
                    ]}
                  />
                  <Pagination currentPage={eventsPage} pageSize={50} total={eventsTotal} onPageChange={setEventsPage} />
                </>
              )}
            </div>
          )}

          {/* Tab: Alerts */}
          {activeTab === 'alerts' && (
            <div>
              {(overview.alerts || []).length === 0 ? (
                <EmptyState title="No alerts associated with this username" description="" />
              ) : (
                <DataTable
                  data={overview.alerts}
                  keyExtractor={(a: any) => String(a.id)}
                  columns={[
                    { key: 'Title', title: 'Title', render: (a: any) => <span className="text-white text-sm">{a.title}</span> },
                    { key: 'Severity', title: 'Severity', render: (a: any) => <SeverityBadge severity={a.severity} /> },
                    { key: 'Status', title: 'Status', render: (a: any) => <StatusBadge status={a.status} /> },
                    { key: 'Rule', title: 'Rule', render: (a: any) => <span className="text-gray-300 text-xs">{a.rule_name || '—'}</span> },
                    { key: 'First Seen', title: 'First Seen', render: (a: any) => <span className="text-gray-400 text-xs">{new Date(a.first_seen).toLocaleString()}</span> },
                    { key: 'Last Seen', title: 'Last Seen', render: (a: any) => <span className="text-gray-400 text-xs">{new Date(a.last_seen).toLocaleString()}</span> },
                    { key: '', title: '', render: (a: any) => (
                      <button onClick={() => setSelectedAlert(a)} className="text-xs text-blue-400 hover:underline">Details</button>
                    )},
                  ]}
                />
              )}
            </div>
          )}

          {/* Tab: Hosts */}
          {activeTab === 'hosts' && (
            <div>
              {(overview.hosts || []).length === 0 ? (
                <EmptyState title="No hosts associated with this username" description="" />
              ) : (
                <DataTable
                  data={overview.hosts}
                  keyExtractor={(h: any) => String(h.hostname)}
                  columns={[
                    { key: 'Hostname', title: 'Hostname', render: (h: any) => (
                      <Link href={`/host-investigation?host=${encodeURIComponent(h.hostname)}`} className="text-blue-400 hover:underline text-sm">{h.hostname}</Link>
                    )},
                    { key: 'OS', title: 'OS', render: (h: any) => <span className="text-gray-300 text-sm">{h.operating_system || '—'}</span> },
                    { key: 'Events', title: 'Events', render: (h: any) => <span className="text-white font-semibold">{h.event_count}</span> },
                    { key: 'First Observed', title: 'First Observed', render: (h: any) => h.first_observed ? new Date(h.first_observed).toLocaleString() : '—' },
                    { key: 'Last Observed', title: 'Last Observed', render: (h: any) => h.last_observed ? new Date(h.last_observed).toLocaleString() : '—' },
                  ]}
                />
              )}
            </div>
          )}

          {/* Tab: Source IPs */}
          {activeTab === 'source-ips' && (
            <div>
              {(overview.source_ips || []).length === 0 ? (
                <EmptyState title="No source IPs observed for this username" description="" />
              ) : (
                <DataTable
                  data={overview.source_ips}
                  keyExtractor={(ip: any) => ip.ip_address}
                  columns={[
                    { key: 'IP Address', title: 'IP Address', render: (ip: any) => (
                      <Link href={`/ip-investigation?ip=${encodeURIComponent(ip.ip_address)}`} className="text-blue-400 hover:underline font-mono text-sm">{ip.ip_address}</Link>
                    )},
                    { key: 'Events', title: 'Events', render: (ip: any) => <span className="text-white font-semibold">{ip.event_count}</span> },
                    { key: 'First Observed', title: 'First Observed', render: (ip: any) => ip.first_observed ? new Date(ip.first_observed).toLocaleString() : '—' },
                    { key: 'Last Observed', title: 'Last Observed', render: (ip: any) => ip.last_observed ? new Date(ip.last_observed).toLocaleString() : '—' },
                  ]}
                />
              )}
            </div>
          )}

          {/* Tab: Destination IPs */}
          {activeTab === 'dest-ips' && (
            <div>
              {(overview.destination_ips || []).length === 0 ? (
                <EmptyState title="No destination IPs observed for this username" description="" />
              ) : (
                <DataTable
                  data={overview.destination_ips}
                  keyExtractor={(ip: any) => ip.ip_address}
                  columns={[
                    { key: 'IP Address', title: 'IP Address', render: (ip: any) => (
                      <Link href={`/ip-investigation?ip=${encodeURIComponent(ip.ip_address)}`} className="text-blue-400 hover:underline font-mono text-sm">{ip.ip_address}</Link>
                    )},
                    { key: 'Events', title: 'Events', render: (ip: any) => <span className="text-white font-semibold">{ip.event_count}</span> },
                    { key: 'First Observed', title: 'First Observed', render: (ip: any) => ip.first_observed ? new Date(ip.first_observed).toLocaleString() : '—' },
                    { key: 'Last Observed', title: 'Last Observed', render: (ip: any) => ip.last_observed ? new Date(ip.last_observed).toLocaleString() : '—' },
                  ]}
                />
              )}
            </div>
          )}

          {/* Tab: Investigations */}
          {activeTab === 'investigations' && (
            <div>
              {(overview.investigations || []).length === 0 ? (
                <EmptyState title="No investigations linked to this username" description="" />
              ) : (
                <DataTable
                  data={overview.investigations}
                  keyExtractor={(i: any) => String(i.id)}
                  columns={[
                    { key: 'Title', title: 'Title', render: (i: any) => (
                      <Link href={`/investigations/${i.id}`} className="text-blue-400 hover:underline text-sm">{i.title}</Link>
                    )},
                    { key: 'Status', title: 'Status', render: (i: any) => <StatusBadge status={i.status} /> },
                    { key: 'Severity', title: 'Severity', render: (i: any) => <SeverityBadge severity={i.severity} /> },
                    { key: 'Evidence', title: 'Evidence', render: (i: any) => <span className="text-gray-300 text-sm">{i.evidence_count_involving_user} pieces</span> },
                    { key: 'Last Updated', title: 'Last Updated', render: (i: any) => new Date(i.updated_at).toLocaleString() },
                  ]}
                />
              )}
            </div>
          )}

          {/* Tab: Activity Breakdown */}
          {activeTab === 'activity' && (
            <div>
              {(overview.activity_breakdown || []).length === 0 ? (
                <EmptyState title="No activity breakdown available" description="" />
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">Event categories observed for this username (all-time)</p>
                  <div className="space-y-2">
                    {overview.activity_breakdown.map((a: any) => {
                      const pct = overview.summary.total_events > 0
                        ? Math.round((a.event_count / overview.summary.total_events) * 100)
                        : 0
                      return (
                        <div key={a.event_category} className="bg-gray-800 rounded p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-gray-200 font-medium">{a.event_category}</span>
                            <span className="text-sm text-gray-400">{a.event_count} events ({pct}%)</span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-1.5">
                            <div
                              className="bg-blue-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {selectedEvent && <EventDetailsModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
      {selectedAlert && <AlertDetailsModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} />}
    </div>
  )
}

export default function UserContextPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading..." />}>
      <UserContextContent />
    </Suspense>
  )
}



