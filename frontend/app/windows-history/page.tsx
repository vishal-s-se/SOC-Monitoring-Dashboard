"use client"

import { useEffect, useState, useCallback, Suspense } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { PageHeader, ErrorState, EmptyState } from '@/components/ui/States'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { DataTable } from '@/components/ui/DataTable'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { FilterBar, FilterInput, FilterSelect } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { EventDetailsModal } from '@/components/ui/EventDetailsModal'
import { TrendAreaChart, CategoryBarChart, DistributionDonutChart } from '@/components/ui/TabCharts'

function WindowsHistoryContent() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>(null)
  const [error, setError] = useState("")
  const [total, setTotal] = useState(0)

  // Agent selector (active + retired)
  const [agentsList, setAgentsList] = useState<any[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState("")

  // Pagination
  const [page, setPage] = useState(1)
  const pageSize = 50

  // Filters
  const [search, setSearch] = useState("")
  const [channel, setChannel] = useState("")
  const [eventIdCode, setEventIdCode] = useState("")
  const [severity, setSeverity] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  // Modal
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 500)
    return () => clearTimeout(handler)
  }, [search])

  // Load Windows agents for provenance filter
  useEffect(() => {
    async function loadAgents() {
      try {
        const res = await api.get<any[]>('/agents')
        const winAgents = (res || []).filter(a => (a.operating_system || '').toLowerCase().includes('win'))
        setAgentsList(winAgents)
      } catch (e) {
        console.error("Failed to load agents list", e)
      }
    }
    loadAgents()
  }, [])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [res, statsRes] = await Promise.all([
        api.get<any>('/events', {
          page,
          page_size: pageSize,
          operating_system: 'windows',
          include_cleared: true,
          channel: channel || undefined,
          severity: severity || undefined,
          agent_id: selectedAgentId || undefined,
          search: (debouncedSearch || eventIdCode) ? `${debouncedSearch} ${eventIdCode}`.trim() : undefined
        }),
        api.get<any>(`/analytics/tab-stats?tab=history&operating_system=windows&hours=168${selectedAgentId ? `&agent_id=${selectedAgentId}` : ''}`)
      ])
      setEvents(res.items || [])
      setTotal(res.total || 0)
      setStats(statsRes)
      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to load Windows event history")
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, channel, severity, selectedAgentId, debouncedSearch, eventIdCode])

  useEffect(() => {
    loadData()
  }, [loadData])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Windows Event History"
          description="Forensic event provenance across active and historical retired Windows agents"
        />
        <span className="inline-flex items-center rounded-md bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-400 ring-1 ring-inset ring-sky-500/20">
          Windows Provenance
        </span>
      </div>

      <div className="p-3 bg-gray-900/60 border border-cyan-800/40 rounded-lg flex items-center space-x-3 text-xs text-gray-300">
        <svg className="w-5 h-5 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>
          <strong>Persistent Forensic Archive:</strong> This history view retains all historical Windows events, including entries cleared from active monitoring views. Underlying security records are never deleted by view-clear operations.
        </span>
      </div>

      {/* Forensic History Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TrendAreaChart
          title="Historical Event Volume (7 Days)"
          subtitle="Long-term Windows telemetry trend"
          data={stats?.timeseries || []}
          color="#38bdf8"
        />
        <DistributionDonutChart
          title="Historical Severity"
          subtitle="Archive severity distribution"
          data={stats?.distribution3 || stats?.distribution1 || []}
          onSliceClick={(item) => {
            setSeverity(item.name)
            setPage(1)
          }}
        />
        <CategoryBarChart
          title="Volume by Host / Agent"
          subtitle="Provenance breakdown (active + retired)"
          data={stats?.distribution2 || []}
          color="#818cf8"
        />
      </div>

      <FilterBar>
        <div className="flex-1">
          <FilterInput
            label="Search Text"
            value={search}
            onChange={(val) => setSearch(val)}
            placeholder="Search descriptions, accounts, commands..."
          />
        </div>
        <div className="w-48">
          <FilterInput
            label="EventID"
            value={eventIdCode}
            onChange={(val) => { setEventIdCode(val); setPage(1); }}
            placeholder="e.g. 4624"
          />
        </div>
        <div className="w-48">
          <FilterSelect
            label="Channel"
            value={channel}
            onChange={(val) => { setChannel(val); setPage(1); }}
            placeholder="All Channels"
            options={[
              { value: 'Security', label: 'Security' },
              { value: 'System', label: 'System' },
              { value: 'Application', label: 'Application' },
              { value: 'Microsoft-Windows-Sysmon/Operational', label: 'Sysmon' },
              { value: 'Microsoft-Windows-PowerShell/Operational', label: 'PowerShell' }
            ]}
          />
        </div>
        <div className="w-56">
          <FilterSelect
            label="Agent Provenance"
            value={selectedAgentId}
            onChange={(val) => { setSelectedAgentId(val); setPage(1); }}
            placeholder="All Agent Provenances"
            options={agentsList.map(a => ({
              value: a.agent_id,
              label: (a.status === 'RETIRED' ? '🔒 [RETIRED] ' : '● [ACTIVE] ') + (a.hostname || a.agent_id.slice(0, 14))
            }))}
          />
        </div>
        <div className="w-40">
          <FilterSelect
            label="Severity"
            value={severity}
            onChange={(val) => { setSeverity(val); setPage(1); }}
            placeholder="All Severities"
            options={[
              { value: 'CRITICAL', label: 'Critical' },
              { value: 'HIGH', label: 'High' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'LOW', label: 'Low' },
              { value: 'INFO', label: 'Info' }
            ]}
          />
        </div>
      </FilterBar>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={10} columns={7} />
          ) : error ? (
            <ErrorState message={error} retry={loadData} />
          ) : events.length === 0 ? (
            <EmptyState
              title="No historical events matched"
              description="No Windows events match the selected agent, channel, or search parameters."
            />
          ) : (
            <div>
              <DataTable
                data={events}
                keyExtractor={(r) => r.event_id || String(r.id)}
                onRowClick={(r) => setSelectedEvent(r)}
                columns={[
                  {
                    key: 'timestamp',
                    title: 'Time',
                    render: (r) => new Date(r.timestamp).toLocaleString()
                  },
                  {
                    key: 'severity',
                    title: 'Sev',
                    render: (r) => <SeverityBadge severity={r.severity || 'INFO'} />
                  },
                  {
                    key: 'event_id_code',
                    title: 'EventID',
                    render: (r) => {
                      const eid = r.event_id_code ?? r.metadata?.event_id ?? r.metadata?.EventID
                      return eid ? (
                        <span className="font-mono text-xs font-semibold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                          {eid}
                        </span>
                      ) : <span className="text-gray-500">-</span>
                    }
                  },
                  {
                    key: 'event_record_id',
                    title: 'Record ID',
                    render: (r) => {
                      const rid = r.metadata?.event_record_id ?? r.metadata?.EventRecordID ?? r.metadata?.RecordNumber
                      return rid ? <span className="font-mono text-xs text-gray-400">{rid}</span> : <span className="text-gray-600">-</span>
                    }
                  },
                  {
                    key: 'channel',
                    title: 'Channel',
                    render: (r) => (
                      <span className="text-xs text-gray-300 font-medium">
                        {r.channel || r.metadata?.channel || r.metadata?.Channel || 'Security'}
                      </span>
                    )
                  },
                  {
                    key: 'endpoint',
                    title: 'Endpoint',
                    render: (r) => (
                      <div className="flex flex-col">
                        <span className="font-mono text-xs text-gray-200">{r.hostname}</span>
                        {r.agent?.status === 'RETIRED' && (
                          <span className="text-[10px] text-amber-400 font-semibold uppercase">Retired Agent</span>
                        )}
                      </div>
                    )
                  },
                  {
                    key: 'description',
                    title: 'Event Summary',
                    render: (r) => (
                      <span className="text-xs text-gray-400 max-w-md truncate block">
                        {r.description || r.action || r.event_type || '-'}
                      </span>
                    )
                  }
                ]}
              />
              <Pagination
                currentPage={page}
                total={total}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  )
}

export default function WindowsHistoryPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <PageHeader title="Windows Event History" description="Historical archive of Windows Security, System, and Sysmon events" />
        <Card><CardContent className="p-0"><TableSkeleton rows={10} columns={7} /></CardContent></Card>
      </div>
    }>
      <WindowsHistoryContent />
    </Suspense>
  )
}
