"use client"

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { PageHeader, ErrorState, EmptyState } from '@/components/ui/States'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { DataTable } from '@/components/ui/DataTable'
import { useWebSocket } from '@/hooks/useWebSocket'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { FilterBar, FilterInput, FilterSelect } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { EventDetailsModal } from '@/components/ui/EventDetailsModal'
import { TabClearControl } from '@/components/ui/TabClearControl'

import { TrendAreaChart, CategoryBarChart, DistributionDonutChart } from '@/components/ui/TabCharts'

function AuthenticationContent() {
  const searchParams = useSearchParams()
  const osParam = searchParams.get('os')?.toLowerCase() || ''

  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>(null)
  const [error, setError] = useState("")
  const [total, setTotal] = useState(0)

  // Pagination
  const [page, setPage] = useState(1)
  const pageSize = 50

  // Filters
  const [search, setSearch] = useState("")
  const [action, setAction] = useState("")
  const [eventType, setEventType] = useState("")

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("")

  // Modal
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)

  const { lastMessage } = useWebSocket()

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 500)
    return () => clearTimeout(handler)
  }, [search])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [res, statsRes] = await Promise.all([
        api.get<any>('/events', {
          page,
          page_size: pageSize,
          event_category: 'authentication',
          view_category: 'authentication',
          event_type: eventType || undefined,
          action: action || undefined,
          operating_system: osParam || undefined,
          search: debouncedSearch || undefined
        }),
        api.get<any>(`/analytics/tab-stats?tab=authentication&hours=24${osParam ? `&operating_system=${osParam}` : ''}`)
      ])
      setEvents(res.items || [])
      setTotal(res.total || 0)
      setStats(statsRes)
      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to load Authentication events")
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, action, eventType, debouncedSearch, osParam])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (lastMessage && lastMessage.type === 'new_event') {
      const newEvent = lastMessage.data

      if (newEvent.event_category?.toLowerCase() === 'authentication' || newEvent.event_type?.toLowerCase().includes('logon') || newEvent.event_type?.toLowerCase().includes('login')) {
        if (osParam) {
          const evOs = (newEvent.operating_system || newEvent.agent?.operating_system || '').toLowerCase()
          if (!evOs.includes(osParam)) return
        }
        if (action && newEvent.action?.toLowerCase() !== action.toLowerCase()) return
        if (eventType && newEvent.event_type?.toLowerCase() !== eventType.toLowerCase()) return

        if (page === 1) {
          setEvents(prev => {
            if (prev.find(e => e.event_id === newEvent.event_id)) return prev
            const updated = [newEvent, ...prev]
            if (updated.length > pageSize) updated.pop()
            return updated
          })
          setTotal(t => t + 1)
        } else {
          setTotal(t => t + 1)
        }
      }
    }
  }, [lastMessage, page, action, eventType, osParam])

  const title = osParam
    ? `${osParam.charAt(0).toUpperCase() + osParam.slice(1)} Authentication Events`
    : 'Authentication Events'

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description="Monitor user logins, authentication failures, and access events"
        actions={
          <div className="flex items-center space-x-3">
            {osParam && (
              <TabClearControl
                operatingSystem={osParam}
                tabCategory="authentication"
                tabTitle={title}
                onCleared={loadData}
                historyUrl={osParam === 'windows' ? '/windows-history' : '/linux-history'}
              />
            )}
            {osParam && (
              <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                osParam === 'windows'
                  ? 'bg-sky-500/10 text-sky-400 ring-sky-500/20'
                  : 'bg-amber-500/10 text-amber-400 ring-amber-500/20'
              }`}>
                {osParam.toUpperCase()} Filtered
              </span>
            )}
          </div>
        }
      />

      {/* Authentication Telemetry Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TrendAreaChart
          title="Authentication Activity (24h)"
          subtitle="Hourly login and session activity"
          data={stats?.timeseries || []}
          color={osParam === 'linux' ? '#f59e0b' : '#38bdf8'}
        />
        <DistributionDonutChart
          title="Success vs Failed Logins"
          subtitle="Authentication result distribution"
          data={stats?.distribution1 || []}
          onSliceClick={(item) => {
            setAction(item.name)
            setPage(1)
          }}
        />
        <CategoryBarChart
          title="Top Accounts / Usernames"
          subtitle="Most active identities"
          data={stats?.distribution2 || []}
          color="#818cf8"
        />
      </div>

      <FilterBar>
        <div className="flex-1">
          <FilterInput
            label="Search User/IP/Host"
            value={search}
            onChange={setSearch}
            placeholder="Search username, IP, Hostname..."
          />
        </div>
        <div className="w-48">
          <FilterSelect
            label="Result/Action"
            value={action}
            onChange={(val) => { setAction(val); setPage(1); }}
            options={[
              { value: 'SUCCESS', label: 'Success' },
              { value: 'FAILED', label: 'Failed' },
              { value: 'DENIED', label: 'Denied' }
            ]}
          />
        </div>
        <div className="w-48">
          <FilterSelect
            label="Event Type"
            value={eventType}
            onChange={(val) => { setEventType(val); setPage(1); }}
            options={[
              { value: 'successful logon', label: 'Successful Logon' },
              { value: 'failed logon', label: 'Failed Logon' },
              { value: 'logoff', label: 'Logoff' },
              { value: 'authentication', label: 'Authentication' }
            ]}
          />
        </div>
      </FilterBar>

      {error ? (
        <ErrorState message={error} retry={loadData} />
      ) : loading && events.length === 0 ? (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <TableSkeleton rows={10} columns={7} />
          </CardContent>
        </Card>
      ) : events.length === 0 ? (
        <EmptyState
          title="No authentication events found"
          description={
            osParam === 'linux'
              ? "No Linux authentication events logged yet (such as sshd logins, sudo authentications, or PAM logs)."
              : "Adjust your filters or wait for new telemetry."
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <DataTable
              data={events}
              keyExtractor={(r) => r.event_id}
              onRowClick={setSelectedEvent}
              columns={[
                { key: 'timestamp', title: 'Time', render: (r) => new Date(r.timestamp).toLocaleString() },
                { key: 'result', title: 'Result', render: (r) => {
                  const act = (r.action || '').toUpperCase();
                  const type = (r.event_type || '').toUpperCase();
                  const isFail = act === 'FAILED' || act === 'DENY' || type.includes('FAIL');
                  const isSuccess = act === 'SUCCESS' || act === 'ALLOW' || type.includes('SUCCESS');
                  if (isFail) return <span className="text-red-400 font-medium">FAILED</span>;
                  if (isSuccess) return <span className="text-green-400 font-medium">SUCCESS</span>;
                  return <span className="text-gray-400 font-medium">{act || 'N/A'}</span>;
                }},
                { key: 'username', title: 'User', render: (r) => r.username || 'N/A' },
                { key: 'event_type', title: 'Type', render: (r) => r.event_type || 'N/A' },
                { key: 'source_ip', title: 'Source IP', render: (r) => r.source_ip || 'N/A' },
                { key: 'hostname', title: 'Endpoint', render: (r) => (
                  <span className="font-semibold text-blue-400">{r.hostname || '-'}</span>
                )},
                { key: 'operating_system', title: 'OS', render: (r) => (
                  <span className="text-gray-300 text-xs capitalize">{r.operating_system || '-'}</span>
                )},
                { key: 'source', title: 'Log Source', render: (r) => (
                  <span className="text-gray-400 font-mono text-xs">{r.source_type || r.source || '-'}</span>
                )},
                { key: 'severity', title: 'Severity', render: (r) => <SeverityBadge severity={r.severity || 'INFO'} /> }
              ]}
            />
            <Pagination
              currentPage={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>
      )}

      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  )
}

export default function AuthenticationPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <PageHeader title="Authentication Events" description="Logon attempts, credential validations, and session events" />
        <Card><CardContent className="p-0"><TableSkeleton rows={10} columns={7} /></CardContent></Card>
      </div>
    }>
      <AuthenticationContent />
    </Suspense>
  )
}
