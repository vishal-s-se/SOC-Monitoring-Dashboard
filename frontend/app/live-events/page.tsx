"use client"

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState } from '@/components/ui/States'
import { DataTable } from '@/components/ui/DataTable'
import { useWebSocket } from '@/hooks/useWebSocket'
import { SeverityBadge } from '@/components/ui/SeverityBadge'

export default function LiveEventsPage() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [isLive, setIsLive] = useState(true)

  const { lastMessage, status } = useWebSocket()

  const loadInitial = async () => {
    try {
      setLoading(true)
      const res = await api.get<any>('/events?limit=50')
      setEvents(res.items || [])
    } catch (err: any) {
      setError(err.message || "Failed to load events")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInitial()
  }, [])

  useEffect(() => {
    if (isLive && lastMessage && lastMessage.type === 'new_event') {
      const newEvent = lastMessage.data
      setEvents(prev => {
        // deduplicate
        if (prev.find(e => e.event_id === newEvent.event_id)) return prev
        const updated = [newEvent, ...prev]
        if (updated.length > 200) updated.pop() // keep max 200
        return updated
      })
    }
  }, [lastMessage, isLive])

  if (loading) return <LoadingState message="Loading events..." />
  if (error) return <ErrorState message={error} retry={loadInitial} />

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Live Events" 
        description="Real-time normalized event stream" 
        actions={
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
        }
      />

      <Card>
        <CardContent className="p-0">
          <DataTable 
            data={events} 
            keyExtractor={(r) => r.event_id}
            columns={[
              { key: 'timestamp', title: 'Time', render: (r) => new Date(r.timestamp).toLocaleString() },
              { key: 'severity', title: 'Sev', render: (r) => <SeverityBadge severity={r.severity || 'INFO'} /> },
              { key: 'hostname', title: 'Host' },
              { key: 'source', title: 'Source', render: (r) => r.source || r.source_type },
              { key: 'event_type', title: 'Type' },
              { key: 'username', title: 'User', render: (r) => r.username || '-' },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  )
}
