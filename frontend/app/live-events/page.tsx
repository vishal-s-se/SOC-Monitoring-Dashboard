"use client"

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { PageHeader, ErrorState } from '@/components/ui/States'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { DataTable } from '@/components/ui/DataTable'
import { useWebSocket } from '@/hooks/useWebSocket'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { EventDetailsModal } from '@/components/ui/EventDetailsModal'

function LiveEventsContent() {
  const searchParams = useSearchParams()
  const osParam = searchParams.get('os')?.toLowerCase() || ''

  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [isLive, setIsLive] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)

  const { lastMessage } = useWebSocket()

  const loadInitial = async () => {
    try {
      setLoading(true)
      const queryParams: any = { limit: 50 }
      if (osParam) {
        queryParams.operating_system = osParam
      }
      const res = await api.get<any>('/events', queryParams)
      setEvents(res.items || [])
    } catch (err: any) {
      setError(err.message || "Failed to load events")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInitial()
  }, [osParam])

  useEffect(() => {
    if (isLive && lastMessage && lastMessage.type === 'new_event') {
      const newEvent = lastMessage.data
      if (osParam) {
        const evOs = (newEvent.operating_system || newEvent.agent?.operating_system || '').toLowerCase()
        if (!evOs.includes(osParam)) {
          return
        }
      }

      setEvents(prev => {
        if (prev.find(e => e.event_id === newEvent.event_id)) return prev
        const updated = [newEvent, ...prev]
        if (updated.length > 200) updated.pop()
        return updated
      })
    }
  }, [lastMessage, isLive, osParam])

  if (error) return <ErrorState message={error} retry={loadInitial} />

  const displayTitle = osParam
    ? `${osParam.charAt(0).toUpperCase() + osParam.slice(1)} Live Events`
    : 'Live Events'

  return (
    <div className="space-y-6">
      <PageHeader
        title={displayTitle}
        description={
          osParam
            ? `Real-time normalized event stream filtered for ${osParam}`
            : 'Real-time normalized event stream across all endpoints'
        }
        actions={
          <div className="flex items-center space-x-3">
            {osParam && (
              <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                osParam === 'windows'
                  ? 'bg-sky-500/10 text-sky-400 ring-sky-500/20'
                  : 'bg-amber-500/10 text-amber-400 ring-amber-500/20'
              }`}>
                {osParam.toUpperCase()} Stream
              </span>
            )}
            <button
              onClick={() => setIsLive(!isLive)}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                isLive
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {isLive ? '● Live Updates ON' : '⏸ Paused'}
            </button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={10} columns={7} />
          ) : (
            <DataTable
              data={events}
              keyExtractor={(r) => r.event_id || String(r.id)}
              onRowClick={(r) => setSelectedEvent(r)}
              columns={[
                { key: 'timestamp', title: 'Time', render: (r) => new Date(r.timestamp).toLocaleTimeString() },
                { key: 'severity', title: 'Sev', render: (r) => <SeverityBadge severity={r.severity || 'INFO'} /> },
                { key: 'hostname', title: 'Host', render: (r) => <span className="font-mono text-xs">{r.hostname}</span> },
                {
                  key: 'os',
                  title: 'OS',
                  render: (r) => (
                    <span className="text-xs text-gray-400">
                      {r.operating_system || '-'}
                    </span>
                  )
                },
                { key: 'source', title: 'Source', render: (r) => <span className="text-xs">{r.source || r.source_type || '-'}</span> },
                { key: 'event_type', title: 'Type', render: (r) => <span className="text-xs text-gray-300 font-mono">{r.event_type || r.action || '-'}</span> },
                { key: 'username', title: 'User', render: (r) => <span className="text-xs text-gray-400">{r.username || '-'}</span> },
              ]}
            />
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

export default function LiveEventsPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <PageHeader title="Live Events" description="Real-time normalized event stream across all endpoints" />
        <Card><CardContent className="p-0"><TableSkeleton rows={10} columns={7} /></CardContent></Card>
      </div>
    }>
      <LiveEventsContent />
    </Suspense>
  )
}
