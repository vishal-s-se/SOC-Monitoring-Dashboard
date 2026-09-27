"use client"

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState } from '@/components/ui/States'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useWebSocket } from '@/hooks/useWebSocket'

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const { lastMessage } = useWebSocket()

  const loadInitial = async () => {
    try {
      setLoading(true)
      const res = await api.get<any>('/agents')
      setAgents(res.items || [])
    } catch (err: any) {
      setError(err.message || "Failed to load agents")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInitial()
  }, [])

  useEffect(() => {
    if (lastMessage && lastMessage.type === 'agent_status_changed') {
      const data = lastMessage.data
      setAgents(prev =>
        prev.map(a => a.agent_id === data.agent_id ? { ...a, status: data.status } : a)
      )

      // If it's a completely new agent not in our list, we might want to just reload
      // But for simplicity, we just update existing rows.
    }
  }, [lastMessage])

  if (loading) return <LoadingState message="Loading agents..." />
  if (error) return <ErrorState message={error} retry={loadInitial} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        description="Manage SOC telemetry collectors deployed across your fleet"
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            data={agents}
            keyExtractor={(r) => r.agent_id}
            columns={[
              { key: 'status', title: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'hostname', title: 'Hostname', render: (r) => <span className="font-medium text-gray-200">{r.hostname}</span> },
              { key: 'ip_address', title: 'IP Address', render: (r) => r.ip_address || '-' },
              { key: 'operating_system', title: 'OS', render: (r) => <span className="capitalize">{r.operating_system}</span> },
              { key: 'agent_version', title: 'Version' },
              { key: 'last_heartbeat', title: 'Last Heartbeat', render: (r) => r.last_heartbeat ? new Date(r.last_heartbeat).toLocaleString() : 'Never' },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  )
}
