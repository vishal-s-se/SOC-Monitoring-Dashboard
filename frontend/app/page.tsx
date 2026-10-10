"use client"

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { DataTable } from '@/components/ui/DataTable'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useRouter } from 'next/navigation'

import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid
} from 'recharts'

export default function OverviewPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  
  const [overview, setOverview] = useState<any>(null)
  const [telemetry, setTelemetry] = useState<any>(null)
  const [alerts, setAlerts] = useState<any>(null)
  const [agents, setAgents] = useState<any>(null)
  const [timeseries, setTimeseries] = useState<any[]>([])
  
  const [recentAlerts, setRecentAlerts] = useState<any[]>([])

  const { lastMessage } = useWebSocket()

  const loadData = async () => {
    try {
      setLoading(true)
      const [
        overviewRes, telemetryRes, alertsRes, agentsRes, timeseriesRes, recentAlertsRes
      ] = await Promise.all([
        api.get<any>('/analytics/overview?hours=24'),
        api.get<any>('/analytics/telemetry?hours=24'),
        api.get<any>('/analytics/alerts?hours=24'),
        api.get<any>('/analytics/agents'),
        api.get<any>('/analytics/timeseries?metric=events&hours=24'),
        api.get<any>('/alerts/?limit=5')
      ])

      setOverview(overviewRes)
      setTelemetry(telemetryRes)
      setAlerts(alertsRes)
      setAgents(agentsRes)
      setTimeseries(timeseriesRes.data || [])
      setRecentAlerts(recentAlertsRes.items || [])
      
    } catch (err: any) {
      setError(err.message || "Failed to load overview data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (lastMessage) {
      if (['new_alert', 'alert_updated', 'agent_status_changed'].includes(lastMessage.type)) {
        loadData()
      }
    }
  }, [lastMessage])

  if (loading) return <LoadingState message="Loading dashboard overview..." />
  if (error) return <ErrorState message={error} retry={loadData} />

  // Format data for Recharts
  const COLORS_SEVERITY: Record<string, string> = {
    CRITICAL: '#ef4444',
    HIGH: '#f97316',
    MEDIUM: '#eab308',
    LOW: '#3b82f6',
    INFO: '#9ca3af',
    UNKNOWN: '#6b7280'
  }
  
  const COLORS_OS: Record<string, string> = {
    WINDOWS: '#0ea5e9',
    LINUX: '#fbbf24',
    DEBIAN: '#fbbf24',
    UBUNTU: '#fbbf24',
    UNKNOWN: '#6b7280'
  }

  const severityData = Object.entries(telemetry?.by_severity || {}).map(([name, value]) => ({
    name: name.toUpperCase(),
    value
  }))

  const osData = Object.entries(telemetry?.by_os || {}).map(([name, value]) => ({
    name: name.toUpperCase(),
    value
  }))

  // Format timeseries for chart
  const formattedTimeseries = timeseries.map(pt => ({
    time: new Date(pt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    count: pt.count
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Overview"
          description="High-level SOC metrics and analytics (Last 24 Hours)"
        />
        <div className="flex space-x-2">
           <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-400 ring-1 ring-inset ring-blue-500/20">
             24h Range
           </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="py-5">
            <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider">Total Events</h3>
            <p className="text-2xl font-bold text-white mt-1">{overview?.total_events?.toLocaleString() || 0}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="py-5">
            <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider">Critical Alerts</h3>
            <p className="text-2xl font-bold text-red-400 mt-1">{alerts?.by_severity?.CRITICAL || 0}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="py-5">
            <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider">High Alerts</h3>
            <p className="text-2xl font-bold text-orange-400 mt-1">{alerts?.by_severity?.HIGH || 0}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="py-5">
            <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider">Active Endpoints</h3>
            <p className="text-2xl font-bold text-green-400 mt-1">{agents?.online_agents || 0}</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="py-5">
            <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider">Events/sec</h3>
            <p className="text-2xl font-bold text-blue-400 mt-1">
              {((overview?.total_events || 0) / (24 * 3600)).toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="py-5">
            <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider">Open Alerts</h3>
            <p className="text-2xl font-bold text-white mt-1">{overview?.open_alerts || 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-gray-900 border-gray-800 flex flex-col">
          <CardHeader title="Event Severity" />
          <CardContent className="flex-1 flex items-center justify-center min-h-[250px]">
            {severityData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={severityData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    onClick={(data) => router.push(`/raw-logs?severity=${data.name}`)}
                    className="cursor-pointer outline-none"
                  >
                    {severityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS_SEVERITY[entry.name] || COLORS_SEVERITY.UNKNOWN} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#f3f4f6' }}
                    itemStyle={{ color: '#f3f4f6' }}
                  />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-sm">No severity data available</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800 flex flex-col">
          <CardHeader title="Events by OS" />
          <CardContent className="flex-1 flex items-center justify-center min-h-[250px]">
             {osData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={osData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    onClick={(data) => router.push(`/raw-logs?os=${data.name}`)}
                    className="cursor-pointer outline-none"
                  >
                    {osData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS_OS[entry.name] || COLORS_OS.UNKNOWN} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#f3f4f6' }}
                    itemStyle={{ color: '#f3f4f6' }}
                  />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-sm">No OS data available</p>
            )}
          </CardContent>
        </Card>
        
        <Card className="bg-gray-900 border-gray-800 flex flex-col">
          <CardHeader title="Alert Lifecycle" />
          <CardContent className="flex-1 flex items-center justify-center min-h-[250px]">
            <div className="w-full space-y-6 px-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-gray-300 font-medium text-sm">Open</span>
                </div>
                <span className="text-white font-bold">{alerts?.by_status?.OPEN || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <span className="text-gray-300 font-medium text-sm">Investigating</span>
                </div>
                <span className="text-white font-bold">{alerts?.by_status?.INVESTIGATING || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-gray-300 font-medium text-sm">Resolved</span>
                </div>
                <span className="text-white font-bold">{alerts?.by_status?.RESOLVED || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-gray-900 border-gray-800 lg:col-span-2">
          <CardHeader title="Event Volume (Last 24h)" />
          <CardContent className="p-4 min-h-[300px]">
            {formattedTimeseries.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={formattedTimeseries} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                  <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => value.toLocaleString()} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#f3f4f6' }}
                    itemStyle={{ color: '#3b82f6' }}
                  />
                  <Area type="monotone" dataKey="count" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCount)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-gray-500 text-sm">
                No timeseries data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader title="Recent Alerts" />
          <CardContent className="p-0 overflow-hidden rounded-b-lg">
            {recentAlerts.length > 0 ? (
              <DataTable
                data={recentAlerts}
                keyExtractor={(r) => r.alert_id}
                columns={[
                  { key: 'severity', title: 'Sev', render: (r) => <SeverityBadge severity={r.severity} /> },
                  { 
                    key: 'title', 
                    title: 'Alert', 
                    render: (r) => (
                      <button 
                        onClick={() => router.push(`/alerts/${r.alert_id}`)}
                        className="font-medium text-left text-gray-200 hover:text-blue-400 transition-colors truncate max-w-[150px] inline-block"
                      >
                        {r.title}
                      </button>
                    ) 
                  },
                ]}
              />
            ) : (
              <div className="p-6 text-center text-gray-500 text-sm">
                No recent alerts.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
