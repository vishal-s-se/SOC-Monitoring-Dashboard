"use client"

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { DataTable } from '@/components/ui/DataTable'
import { useWebSocket } from '@/hooks/useWebSocket'

export default function OverviewPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [stats, setStats] = useState({
    totalAgents: 0,
    onlineAgents: 0,
    totalAlerts: 0,
    openAlerts: 0
  })
  const [recentAlerts, setRecentAlerts] = useState<any[]>([])
  const [recentEvents, setRecentEvents] = useState<any[]>([])

  const { lastMessage } = useWebSocket()

  const loadData = async () => {
    try {
      setLoading(true)
      const [agentsRes, alertsRes, eventsRes, openAlertsRes] = await Promise.all([
        api.get<any>('/agents'),
        api.get<any>('/alerts?limit=5'),
        api.get<any>('/events?limit=5'),
        api.get<any>('/alerts?status=OPEN')
      ])

      const agents = agentsRes.items || []
      setStats({
        totalAgents: agents.length,
        onlineAgents: agents.filter((a: any) => a.status === 'ONLINE').length,
        totalAlerts: alertsRes.total,
        openAlerts: openAlertsRes.total
      })
      setRecentAlerts(alertsRes.items || [])
      setRecentEvents(eventsRes.items || [])
    } catch (err: any) {
      setError(err.message || "Failed to load overview data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Listen for realtime updates to refresh counts if necessary
  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'new_alert' || lastMessage.type === 'alert_updated' || lastMessage.type === 'agent_status_changed') {
        loadData()
      }
    }
  }, [lastMessage])

  if (loading) return <LoadingState message="Loading dashboard overview..." />
  if (error) return <ErrorState message={error} retry={loadData} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="SOC Overview"
        description="High-level metrics and recent security activity"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="py-6">
            <h3 className="text-gray-400 text-sm font-medium">Total Agents</h3>
            <p className="text-3xl font-bold text-white mt-2">{stats.totalAgents}</p>
            <p className="text-sm text-green-400 mt-1">{stats.onlineAgents} online</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-6">
            <h3 className="text-gray-400 text-sm font-medium">Open Alerts</h3>
            <p className="text-3xl font-bold text-red-400 mt-2">{stats.openAlerts}</p>
            <p className="text-sm text-gray-400 mt-1">Requires triage</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-6">
            <h3 className="text-gray-400 text-sm font-medium">Total Alerts</h3>
            <p className="text-3xl font-bold text-white mt-2">{stats.totalAlerts}</p>
            <p className="text-sm text-gray-400 mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-6">
            <h3 className="text-gray-400 text-sm font-medium">Active Investigations</h3>
            <p className="text-3xl font-bold text-gray-500 mt-2">0</p>
            <p className="text-sm text-gray-500 mt-1">Coming soon</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Recent Alerts" />
          <CardContent className="p-0">
            <DataTable
              data={recentAlerts}
              keyExtractor={(r) => r.alert_id}
              columns={[
                { key: 'severity', title: 'Severity', render: (r) => <SeverityBadge severity={r.severity} /> },
                { key: 'title', title: 'Alert', render: (r) => <span className="font-medium">{r.title}</span> },
                { key: 'status', title: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Recent Events" />
          <CardContent className="p-0">
            <DataTable
              data={recentEvents}
              keyExtractor={(r) => r.event_id}
              columns={[
                { key: 'timestamp', title: 'Time', render: (r) => new Date(r.timestamp).toLocaleTimeString() },
                { key: 'event_type', title: 'Type' },
                { key: 'hostname', title: 'Host' },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
