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

function ProcessesContent() {
  const searchParams = useSearchParams()
  const osParam = searchParams.get('os')?.toLowerCase() || ''

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
        operating_system: osParam || undefined,
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
  }, [page, pageSize, eventType, debouncedSearch, osParam])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (lastMessage && lastMessage.type === 'new_event') {
      const newEvent = lastMessage.data

      if (newEvent.event_category?.toLowerCase() === 'process' || newEvent.event_type?.toLowerCase().includes('process')) {
        if (osParam) {
          const evOs = (newEvent.operating_system || newEvent.agent?.operating_system || '').toLowerCase()
          if (!evOs.includes(osParam)) return
        }
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
  }, [lastMessage, page, eventType, osParam])

  const title = osParam
    ? `${osParam.charAt(0).toUpperCase() + osParam.slice(1)} Process Executions`
    : 'Process Executions'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={title}
          description="Monitor process creation, commandline execution, and daemon tracking"
        />
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

      <FilterBar>
        <div className="flex-1">
          <FilterInput
            label="Search Process/Host/User"
            value={search}
            onChange={setSearch}
            placeholder="Search process name, command, username, hostname..."
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
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <TableSkeleton rows={10} columns={7} />
          </CardContent>
        </Card>
      ) : events.length === 0 ? (
        <EmptyState
          title="No process events found"
          description={
            osParam === 'linux'
              ? "No Linux process creation events logged yet. Process events populate from systemd execution logs and process auditing."
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
                { key: 'process', title: 'Process / Command', render: (r) => {
                  const pName = r.metadata?.process_name ?? r.metadata?.ProcessName ?? r.metadata?.NewProcessName ?? r.metadata?.COMMAND ?? r.metadata?._COMM ?? r.metadata_?.process_name ?? r.metadata_?.image ?? r.event_type;
                  return (
                    <span className="font-mono text-xs font-semibold text-gray-200">
                      {pName || 'N/A'}
                    </span>
                  );
                }},
                { key: 'pid', title: 'PID', render: (r) => {
                  const pid = r.metadata?.process_id ?? r.metadata?.ProcessId ?? r.metadata?._PID ?? r.metadata_?.process_id ?? r.metadata_?.pid;
                  return <span className="font-mono text-xs text-gray-400">{pid || '-'}</span>;
                }},
                { key: 'parent', title: 'Parent Process', render: (r) => {
                  const parent = r.metadata?.parent_process_name ?? r.metadata?.ParentProcessName ?? r.metadata_?.parent_process_name ?? r.metadata_?.parent_image;
                  return <span className="font-mono text-xs text-gray-400">{parent || '-'}</span>;
                }},
                { key: 'username', title: 'User', render: (r) => r.username || r.metadata?._UID || 'N/A' },
                { key: 'hostname', title: 'Host', render: (r) => <span className="font-mono text-xs">{r.hostname || 'N/A'}</span> },
                { key: 'event_type', title: 'Type', render: (r) => <span className="text-xs text-gray-400">{r.event_type || 'N/A'}</span> },
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

export default function ProcessesPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <PageHeader title="Process Events" description="Process creation, command execution, and parent-child tracking" />
        <Card><CardContent className="p-0"><TableSkeleton rows={10} columns={7} /></CardContent></Card>
      </div>
    }>
      <ProcessesContent />
    </Suspense>
  )
}
