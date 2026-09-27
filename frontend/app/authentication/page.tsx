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

export default function AuthenticationPage() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
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
      const res = await api.get<any>('/events', {
        page,
        page_size: pageSize,
        event_category: 'authentication',
        event_type: eventType || undefined,
        action: action || undefined,
        search: debouncedSearch || undefined
      })
      setEvents(res.items || [])
      setTotal(res.total || 0)
      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to load Authentication events")
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, action, eventType, debouncedSearch])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (lastMessage && lastMessage.type === 'new_event') {
      const newEvent = lastMessage.data

      if (newEvent.event_category?.toLowerCase() === 'authentication' || newEvent.event_type?.toLowerCase().includes('logon') || newEvent.event_type?.toLowerCase().includes('login')) {
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
  }, [lastMessage, page, action, eventType])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Authentication Events"
        description="Monitor user logins, authentication failures, and access events"
      />

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
        <LoadingState message="Loading Authentication events..." />
      ) : events.length === 0 ? (
        <EmptyState
          title="No authentication events found"
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
                { key: 'hostname', title: 'Host', render: (r) => r.hostname || 'N/A' },
                { key: 'source', title: 'Source', render: (r) => r.source_type || 'N/A' },
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
