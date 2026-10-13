"use client"

import { useEffect, useState, useCallback } from 'react'
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

export default function LinuxLogsPage() {
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
  const [severity, setSeverity] = useState("")
  const [sourceType, setSourceType] = useState("")

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
          operating_system: 'linux',
          view_category: 'logs',
          severity: severity || undefined,
          source_type: sourceType || undefined,
          search: debouncedSearch || undefined
        }),
        api.get<any>('/analytics/tab-stats?tab=logs&operating_system=linux&hours=24')
      ])
      setEvents(res.items || [])
      setTotal(res.total || 0)
      setStats(statsRes)
      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to load Linux events")
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, severity, sourceType, debouncedSearch])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (lastMessage && lastMessage.type === 'new_event') {
      const newEvent = lastMessage.data

      // Only process if it matches our criteria
      if (newEvent.operating_system?.toLowerCase() === 'linux') {
        if (severity && newEvent.severity !== severity) return
        if (sourceType && newEvent.source !== sourceType) return

        // Add to list if we are on the first page
        if (page === 1) {
          setEvents(prev => {
            if (prev.find(e => e.event_id === newEvent.event_id)) return prev
            const updated = [newEvent, ...prev]
            if (updated.length > pageSize) updated.pop()
            return updated
          })
          setTotal(t => t + 1)
        } else {
          // If not on first page, just increment total to show there are new events
          setTotal(t => t + 1)
        }
      }
    }
  }, [lastMessage, page, severity, sourceType])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Linux Logs"
        description="Search and filter normalized Linux event logs"
        actions={
          <TabClearControl
            operatingSystem="linux"
            tabCategory="logs"
            tabTitle="Linux Logs"
            onCleared={loadData}
            historyUrl="/linux-history"
          />
        }
      />

      {/* Visualizations: Systemd Units, Priorities, Volume */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TrendAreaChart
          title="Linux Event Volume (24h)"
          subtitle="Hourly journald & syslog ingestion trajectory"
          data={stats?.timeseries || []}
          color="#f59e0b"
        />
        <CategoryBarChart
          title="Systemd Units & Daemons"
          subtitle="Top active services (SYSLOG_IDENTIFIER)"
          data={stats?.distribution2 || []}
          color="#d97706"
        />
        <DistributionDonutChart
          title="Log Priority Breakdown"
          subtitle="Journald syslog priority classes"
          data={stats?.distribution3 || []}
        />
      </div>

      <FilterBar>
        <div className="flex-1">
          <FilterInput
            label="Search"
            value={search}
            onChange={setSearch}
            placeholder="Search host, user, type..."
          />
        </div>
        <div className="w-48">
          <FilterSelect
            label="Severity"
            value={severity}
            onChange={(val) => { setSeverity(val); setPage(1); }}
            options={[
              { value: 'CRITICAL', label: 'Critical' },
              { value: 'HIGH', label: 'High' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'LOW', label: 'Low' },
              { value: 'INFO', label: 'Info' }
            ]}
          />
        </div>
        <div className="w-48">
          <FilterSelect
            label="Source/Log"
            value={sourceType}
            onChange={(val) => { setSourceType(val); setPage(1); }}
            options={[
              { value: 'auth.log', label: 'auth.log' },
              { value: 'syslog', label: 'syslog' },
              { value: 'secure', label: 'secure' },
              { value: 'journald', label: 'journald' },
              { value: 'kernel', label: 'kernel' }
            ]}
          />
        </div>
      </FilterBar>

      {error ? (
        <ErrorState message={error} retry={loadData} />
      ) : loading && events.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <TableSkeleton rows={10} columns={7} />
          </CardContent>
        </Card>
      ) : events.length === 0 ? (
        <EmptyState
          title="No Linux events found"
          description="Adjust your filters or wait for new telemetry."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <DataTable
              data={events}
              keyExtractor={(r) => r.event_id}
              onRowClick={setSelectedEvent}
              columns={[
                { key: 'timestamp', title: 'Time', render: (r) => new Date(r.timestamp).toLocaleString() },
                { key: 'hostname', title: 'Endpoint', render: (r) => (
                  <span className="font-semibold text-blue-400">{r.hostname || '-'}</span>
                )},
                { key: 'source', title: 'Source / Ingestion', render: (r) => (
                  <span className="text-gray-300 font-mono text-xs">{r.source_type || r.source || 'linux_journald'}</span>
                )},
                { key: 'unit', title: 'Unit / Process', render: (r) => (
                  <span className="text-gray-200 font-mono text-xs">
                    {r.metadata_?._SYSTEMD_UNIT || r.metadata_?.SYSLOG_IDENTIFIER || r.metadata_?._COMM || r.metadata_?.process_name || '-'}
                  </span>
                )},
                { key: 'severity', title: 'Severity', render: (r) => <SeverityBadge severity={r.severity || 'INFO'} /> },
                { key: 'username', title: 'User / Account', render: (r) => r.username || (r.metadata_?._UID === '0' ? 'root (0)' : r.metadata_?._UID || '-') },
                { key: 'message', title: 'Message / Log Entry', render: (r) => (
                  <span className="truncate max-w-sm block text-gray-400 font-mono text-xs">
                    {r.metadata_?.MESSAGE || r.metadata_?.message || r.action || '-'}
                  </span>
                )}
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
