"use client"

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/ui/States'
import { DataTable } from '@/components/ui/DataTable'
import { useWebSocket } from '@/hooks/useWebSocket'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { FilterBar, FilterInput, FilterSelect } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { EventDetailsModal } from '@/components/ui/EventDetailsModal'

export default function FirewallPage() {
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
  const [protocol, setProtocol] = useState("")

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
        event_type: 'firewall',
        action: action || undefined,
        protocol: protocol || undefined,
        search: debouncedSearch || undefined
      })
      setEvents(res.items || [])
      setTotal(res.total || 0)
      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to load Firewall events")
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, action, protocol, debouncedSearch])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (lastMessage && lastMessage.type === 'new_event') {
      const newEvent = lastMessage.data

      // Only process if it matches our criteria
      if (newEvent.event_type?.toLowerCase() === 'firewall' || newEvent.source_type?.toLowerCase().includes('firewall')) {
        if (action && newEvent.action?.toLowerCase() !== action.toLowerCase()) return
        if (protocol && newEvent.protocol?.toLowerCase() !== protocol.toLowerCase()) return

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
          setTotal(t => t + 1)
        }
      }
    }
  }, [lastMessage, page, action, protocol])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Firewall Logs"
        description="Search and filter firewall network security events"
      />

      <FilterBar>
        <div className="flex-1">
          <FilterInput
            label="Search IPs/Host"
            value={search}
            onChange={setSearch}
            placeholder="Search IP, Hostname..."
          />
        </div>
        <div className="w-48">
          <FilterSelect
            label="Action"
            value={action}
            onChange={(val) => { setAction(val); setPage(1); }}
            options={[
              { value: 'ALLOW', label: 'Allow' },
              { value: 'DENY', label: 'Deny' },
              { value: 'BLOCK', label: 'Block' },
              { value: 'DROP', label: 'Drop' },
              { value: 'ACCEPT', label: 'Accept' }
            ]}
          />
        </div>
        <div className="w-48">
          <FilterSelect
            label="Protocol"
            value={protocol}
            onChange={(val) => { setProtocol(val); setPage(1); }}
            options={[
              { value: 'TCP', label: 'TCP' },
              { value: 'UDP', label: 'UDP' },
              { value: 'ICMP', label: 'ICMP' }
            ]}
          />
        </div>
      </FilterBar>

      {error ? (
        <ErrorState message={error} retry={loadData} />
      ) : loading && events.length === 0 ? (
        <LoadingState message="Loading Firewall events..." />
      ) : events.length === 0 ? (
        <EmptyState
          title="No firewall events found"
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
                { key: 'action', title: 'Action', render: (r) => (
                  <span className={`font-semibold ${r.action?.match(/deny|block|drop/i) ? 'text-red-400' : r.action?.match(/allow|accept/i) ? 'text-green-400' : 'text-gray-400'}`}>
                    {r.action || 'N/A'}
                  </span>
                )},
                { key: 'protocol', title: 'Proto', render: (r) => r.protocol || 'N/A' },
                { key: 'source_ip', title: 'Source IP', render: (r) => (
                  r.source_ip ? (
                    <Link
                      href={`/ip-investigation?ip=${encodeURIComponent(r.source_ip)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-400 hover:text-blue-300 hover:underline font-mono"
                    >
                      {r.source_ip}
                    </Link>
                  ) : 'N/A'
                )},
                { key: 'source_port', title: 'S.Port', render: (r) => r.source_port || 'N/A' },
                { key: 'destination_ip', title: 'Dest IP', render: (r) => (
                  r.destination_ip ? (
                    <Link
                      href={`/ip-investigation?ip=${encodeURIComponent(r.destination_ip)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-400 hover:text-blue-300 hover:underline font-mono"
                    >
                      {r.destination_ip}
                    </Link>
                  ) : 'N/A'
                )},
                { key: 'destination_port', title: 'D.Port', render: (r) => r.destination_port || 'N/A' },
                { key: 'hostname', title: 'Host', render: (r) => r.hostname || 'N/A' },
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
