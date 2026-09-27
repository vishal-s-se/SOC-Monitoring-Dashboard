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

export default function ProcessesPage() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [total, setTotal] = useState(0)

  // Pagination
  const [page, setPage] = useState(1)
  const pageSize = 50

  // Filters
  const [search, setSearch] = useState("")
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
      const res = await api.get<any>('/events', {
        page,
        page_size: pageSize,
        event_category: 'process',
        event_type: eventType || undefined,
        search: debouncedSearch || undefined
      })
      setEvents(res.items || [])
      setTotal(res.total || 0)
      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to load Process events")
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, eventType, debouncedSearch])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (lastMessage && lastMessage.type === 'new_event') {
      const newEvent = lastMessage.data

      if (newEvent.event_category?.toLowerCase() === 'process' || newEvent.event_type?.toLowerCase().includes('process')) {
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
  }, [lastMessage, page, eventType])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Process Executions"
        description="Monitor process creation, termination, and execution events"
      />

      <FilterBar>
        <div className="flex-1">
          <FilterInput
            label="Search Process/Host/User"
            value={search}
            onChange={setSearch}
            placeholder="Search process name, username, hostname..."
          />
        </div>
        <div className="w-64">
          <FilterSelect
            label="Event Type"
            value={eventType}
            onChange={(val) => { setEventType(val); setPage(1); }}
            options={[
              { value: 'process creation', label: 'Process Creation' },
              { value: 'process termination', label: 'Process Termination' },
              { value: 'sysmon process creation', label: 'Sysmon Process Creation' }
            ]}
          />
        </div>
      </FilterBar>

      {error ? (
        <ErrorState message={error} retry={loadData} />
      ) : loading && events.length === 0 ? (
        <LoadingState message="Loading Process events..." />
      ) : events.length === 0 ? (
        <EmptyState
          title="No process events found"
          description="Adjust your filters or wait for new telemetry."
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
                { key: 'process', title: 'Process', render: (r) => (
                  <span className="font-medium text-gray-200">
                    {r.metadata_?.process_name || r.metadata_?.image || 'N/A'}
                  </span>
                )},
                { key: 'pid', title: 'PID', render: (r) => r.metadata_?.process_id || r.metadata_?.pid || 'N/A' },
                { key: 'parent', title: 'Parent Process', render: (r) => r.metadata_?.parent_process_name || r.metadata_?.parent_image || 'N/A' },
                { key: 'ppid', title: 'PPID', render: (r) => r.metadata_?.parent_process_id || r.metadata_?.ppid || 'N/A' },
                { key: 'username', title: 'User', render: (r) => r.username || 'N/A' },
                { key: 'hostname', title: 'Host', render: (r) => r.hostname || 'N/A' },
                { key: 'event_type', title: 'Type', render: (r) => r.event_type || 'N/A' },
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
