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

export default function WindowsLogsPage() {
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
          operating_system: 'windows',
          view_category: 'logs',
          severity: severity || undefined,
          source_type: sourceType || undefined,
          search: debouncedSearch || undefined
        }),
        api.get<any>('/analytics/tab-stats?tab=logs&operating_system=windows&hours=24')
      ])
      setEvents(res.items || [])
      setTotal(res.total || 0)
      setStats(statsRes)
      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to load Windows events")
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
      if (newEvent.operating_system?.toLowerCase() === 'windows') {
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
        title="Windows Logs"
        description="Search and filter normalized Windows event logs"
        actions={
          <TabClearControl
            operatingSystem="windows"
            tabCategory="logs"
            tabTitle="Windows Logs"
            onCleared={loadData}
            historyUrl="/windows-history"
          />
        }
      />

      {/* Visualizations: Channels, EventIDs, Volume */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TrendAreaChart
          title="Windows Event Volume (24h)"
          subtitle="Hourly ingestion trajectory"
          data={stats?.timeseries || []}
          color="#0ea5e9"
        />
        <DistributionDonutChart
          title="Events by Channel"
          subtitle="Security, System, Application channels"
          data={stats?.distribution1 || []}
          onSliceClick={(item) => {
            const raw = item.name.replace('windows_', '')
            setSourceType(raw)
            setPage(1)
          }}
        />
        <CategoryBarChart
          title="Top Event IDs / Types"
          subtitle="Most frequent Windows event identifiers"
          data={stats?.distribution2 || []}
          color="#38bdf8"
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
            label="Channel/Source"
            value={sourceType}
            onChange={(val) => { setSourceType(val); setPage(1); }}
            options={[
              { value: 'Security', label: 'Security' },
              { value: 'System', label: 'System' },
              { value: 'Application', label: 'Application' },
              { value: 'Sysmon', label: 'Sysmon' },
              { value: 'PowerShell', label: 'PowerShell' }
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
          title="No Windows events found"
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
                { key: 'event_id_disp', title: 'Event ID', render: (r) => (
                  <span className="font-mono text-emerald-400 font-semibold">{r.metadata_?.EventID || r.metadata_?.event_id || r.event_type || '-'}</span>
                )},
                { key: 'record_id_disp', title: 'Record ID', render: (r) => (
                  <span className="font-mono text-gray-400">{r.metadata_?.EventRecordID || '-'}</span>
                )},
                { key: 'source', title: 'Channel / Provider', render: (r) => (
                  <span className="text-gray-300">{r.metadata_?.Channel || r.source_type || r.source || '-'}</span>
                )},
                { key: 'severity', title: 'Severity', render: (r) => <SeverityBadge severity={r.severity || 'INFO'} /> },
                { key: 'username', title: 'User / Account', render: (r) => r.username || '-' },
                { key: 'message', title: 'Rendered Description / Action', render: (r) => (
                  <span className="truncate max-w-xs block text-gray-400 font-mono text-xs">
                    {r.metadata_?.message || r.action || '-'}
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
