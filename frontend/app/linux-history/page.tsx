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

function LinuxHistoryContent() {
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
  const [unitFilter, setUnitFilter] = useState("")
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

  // Load Linux agents for provenance filter
  useEffect(() => {
    async function loadAgents() {
      try {
        const res = await api.get<any[]>('/agents')
        const linAgents = (res || []).filter(a => !(a.operating_system || '').toLowerCase().includes('win'))
        setAgentsList(linAgents)
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
          operating_system: 'linux',
          include_cleared: true,
          severity: severity || undefined,
          agent_id: selectedAgentId || undefined,
          search: (debouncedSearch || unitFilter) ? `${debouncedSearch} ${unitFilter}`.trim() : undefined
        }),
        api.get<any>(`/analytics/tab-stats?tab=history&operating_system=linux&hours=168${selectedAgentId ? `&agent_id=${selectedAgentId}` : ''}`)
      ])
      setEvents(res.items || [])
      setTotal(res.total || 0)
      setStats(statsRes)
      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to load Linux event history")
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, severity, selectedAgentId, debouncedSearch, unitFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Linux Event History"
          description="Forensic event provenance across active and historical retired Linux/Kali agents"
        />
        <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400 ring-1 ring-inset ring-amber-500/20">
          Linux Provenance
        </span>
      </div>

      <div className="p-3 bg-gray-900/60 border border-amber-800/40 rounded-lg flex items-center space-x-3 text-xs text-gray-300">
        <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>
          <strong>Persistent Forensic Archive:</strong> This history view retains all historical Linux events, including entries cleared from active monitoring views. Underlying security records are never deleted by view-clear operations.
        </span>
      </div>

      {/* Linux Forensic History Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TrendAreaChart
          title="Historical Event Volume (7 Days)"
          subtitle="Long-term Linux / Kali telemetry trend"
          data={stats?.timeseries || []}
          color="#f59e0b"
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
          color="#ea580c"
        />
      </div>

      <FilterBar>
        <div className="flex-1">
          <FilterInput
            label="Search Text"
            value={search}
            onChange={(val) => setSearch(val)}
            placeholder="Search journal entries, syslog messages, accounts..."
          />
        </div>
        <div className="w-56">
          <FilterInput
            label="Systemd Unit / Process"
            value={unitFilter}
            onChange={(val) => { setUnitFilter(val); setPage(1); }}
            placeholder="e.g. systemd, sshd"
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
            <TableSkeleton rows={10} columns={6} />
          ) : error ? (
            <ErrorState message={error} retry={loadData} />
          ) : events.length === 0 ? (
            <EmptyState
              title="No historical events matched"
              description="No Linux journald events match the selected agent, unit, or search parameters."
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
                    key: 'unit',
                    title: 'Systemd Unit / Process',
                    render: (r) => {
                      const unit = r.metadata?.UNIT || r.metadata?._SYSTEMD_UNIT || r.metadata?.SYSLOG_IDENTIFIER || r.metadata?._COMM || r.event_type || '-'
                      return (
                        <span className="font-mono text-xs font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          {unit}
                        </span>
                      )
                    }
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
                    key: 'source',
                    title: 'Source Ingestion',
                    render: (r) => <span className="text-xs text-gray-400">{r.source || 'linux_journald'}</span>
                  },
                  {
                    key: 'description',
                    title: 'Journal Entry / Log Content',
                    render: (r) => {
                      const msg = r.description || r.metadata?.MESSAGE || r.action || '-'
                      return (
                        <span className="text-xs text-gray-300 font-mono max-w-md truncate block">
                          {msg}
                        </span>
                      )
                    }
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

export default function LinuxHistoryPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <PageHeader title="Linux Event History" description="Historical archive of Linux systemd journald and syslog events" />
        <Card><CardContent className="p-0"><TableSkeleton rows={10} columns={6} /></CardContent></Card>
      </div>
    }>
      <LinuxHistoryContent />
    </Suspense>
  )
}
