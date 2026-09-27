"use client"

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/ui/States'
import { DataTable } from '@/components/ui/DataTable'
import { useWebSocket } from '@/hooks/useWebSocket'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { FilterBar, FilterInput, FilterSelect } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { EventDetailsModal } from '@/components/ui/EventDetailsModal'

export default function WindowsLogsPage() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
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
      const res = await api.get<any>('/events', {
        page,
        page_size: pageSize,
        operating_system: 'windows',
        severity: severity || undefined,
        source_type: sourceType || undefined,
        search: debouncedSearch || undefined
      })
      setEvents(res.items || [])
      setTotal(res.total || 0)
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
      />

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
        <LoadingState message="Loading Windows events..." />
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
                { key: 'event_id_disp', title: 'Event ID', render: (r) => (r.metadata_?.event_id) || '-' },
                { key: 'source', title: 'Channel', render: (r) => r.source_type || r.source || '-' },
                { key: 'event_type', title: 'Type', render: (r) => <span className="font-medium text-gray-200">{r.event_type}</span> },
                { key: 'hostname', title: 'Host' },
                { key: 'severity', title: 'Severity', render: (r) => <SeverityBadge severity={r.severity || 'INFO'} /> },
                { key: 'username', title: 'User', render: (r) => r.username || '-' },
                { key: 'message', title: 'Message', render: (r) => (
                  <span className="truncate max-w-xs block text-gray-400">
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
