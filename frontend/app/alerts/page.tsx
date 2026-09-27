"use client"

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState } from '@/components/ui/States'
import { DataTable } from '@/components/ui/DataTable'
import { useWebSocket } from '@/hooks/useWebSocket'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { StatusBadge } from '@/components/ui/StatusBadge'

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const { lastMessage } = useWebSocket()

  const loadInitial = async () => {
    try {
      setLoading(true)
      const res = await api.get<any>('/alerts?limit=50')
      setAlerts(res.items || [])
    } catch (err: any) {
      setError(err.message || "Failed to load alerts")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInitial()
  }, [])

  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'new_alert') {
        const newAlert = lastMessage.data
        setAlerts(prev => {
          if (prev.find(a => a.alert_id === newAlert.alert_id)) return prev
          return [newAlert, ...prev]
        })
      } else if (lastMessage.type === 'alert_updated') {
        const updatedAlert = lastMessage.data
        setAlerts(prev => 
          prev.map(a => a.alert_id === updatedAlert.alert_id ? { ...a, ...updatedAlert } : a)
        )
      }
    }
  }, [lastMessage])

  if (loading) return <LoadingState message="Loading alerts..." />
  if (error) return <ErrorState message={error} retry={loadInitial} />

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Alerts" 
        description="Security detections requiring attention" 
      />

      <Card>
        <CardContent className="p-0">
          <DataTable 
            data={alerts} 
            keyExtractor={(r) => r.alert_id}
            columns={[
              { key: 'first_seen', title: 'Time', render: (r) => new Date(r.first_seen || r.timestamp).toLocaleString() },
              { key: 'severity', title: 'Severity', render: (r) => <SeverityBadge severity={r.severity} /> },
              { key: 'title', title: 'Alert', render: (r) => <span className="font-medium text-gray-200">{r.title}</span> },
              { key: 'status', title: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'occurrence_count', title: 'Count', render: (r) => <span className="text-gray-400 text-xs">x{r.occurrence_count || 1}</span> },
              { key: 'actions', title: '', render: (r) => (
                <div className="flex space-x-2 justify-end">
                  {r.status === 'OPEN' && (
                    <button 
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await api.post(`/alerts/${r.alert_id}/acknowledge`, {});
                          // State will update via websocket
                        } catch (err) {
                          console.error("Failed to ack", err);
                        }
                      }}
                      className="px-3 py-1 bg-blue-600/20 text-blue-400 text-xs rounded hover:bg-blue-600/40 transition-colors"
                    >
                      Ack
                    </button>
                  )}
                  {(r.status === 'OPEN' || r.status === 'ACKNOWLEDGED') && (
                    <button 
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await api.post(`/alerts/${r.alert_id}/resolve`, {});
                        } catch (err) {
                          console.error("Failed to resolve", err);
                        }
                      }}
                      className="px-3 py-1 bg-green-600/20 text-green-400 text-xs rounded hover:bg-green-600/40 transition-colors"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              )}
            ]}
          />
        </CardContent>
      </Card>
    </div>
  )
}
