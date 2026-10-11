"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState } from '@/components/ui/States'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { DataTable } from '@/components/ui/DataTable'
import { useWebSocket } from '@/hooks/useWebSocket'
import { EventDetailsModal } from '@/components/ui/EventDetailsModal'

import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid
} from 'recharts'

export default function LinuxOverviewPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [overview, setOverview] = useState<any>(null)
  const [telemetry, setTelemetry] = useState<any>(null)
  const [agents, setAgents] = useState<any>(null)
  const [timeseries, setTimeseries] = useState<any[]>([])
  const [recentEvents, setRecentEvents] = useState<any[]>([])
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)

  const { lastMessage } = useWebSocket()

  const loadData = async () => {
    try {
      setLoading(true)
      const [
        overviewRes,
        telemetryRes,
        agentsRes,
        timeseriesRes,
        eventsRes
      ] = await Promise.all([
        api.get<any>('/analytics/overview?hours=24&operating_system=linux'),
        api.get<any>('/analytics/telemetry?hours=24&operating_system=linux'),
        api.get<any>('/analytics/agents?operating_system=linux'),
        api.get<any>('/analytics/timeseries?metric=events&hours=24&operating_system=linux'),
        api.get<any>('/events?page=1&page_size=10&operating_system=linux')
      ])

      setOverview(overviewRes)
      setTelemetry(telemetryRes)
      setAgents(agentsRes)
      setTimeseries(timeseriesRes.data || [])
      setRecentEvents(eventsRes.items || [])
      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to load Linux overview data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (lastMessage && (lastMessage.type === 'new_event' || lastMessage.type === 'new_alert')) {
      const data = lastMessage.data
      const os = (data?.operating_system || data?.agent?.operating_system || '').toLowerCase()
      if (os.includes('linux') || os.includes('kali') || os.includes('debian') || os.includes('ubuntu')) {
        loadData()
      }
    }
  }, [lastMessage])

  if (loading) return <LoadingState message="Loading Linux overview telemetry..." />
  if (error) return <ErrorState message={error} retry={loadData} />

  const COLORS_SEVERITY: Record<string, string> = {
    CRITICAL: '#ef4444',
    HIGH: '#f97316',
    MEDIUM: '#eab308',
    LOW: '#3b82f6',
    INFO: '#f59e0b',
    UNKNOWN: '#6b7280'
  }

  const severityData = Object.entries(telemetry?.by_severity || {}).map(([name, value]) => ({
    name: name.toUpperCase(),
    value
  }))

  const categoryData = Object.entries(telemetry?.by_category || {}).map(([name, value]) => ({
    name,
    value
  }))

  const CATEGORY_COLORS = ['#f59e0b', '#10b981', '#6366f1', '#ec4899', '#8b5cf6', '#06b6d4']

  const formattedTimeseries = timeseries.map(pt => ({
    time: new Date(pt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    count: pt.count
  }))

  const totalEvents = overview?.events_received ?? overview?.total_events ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Linux Monitoring Overview"
          description="Systemd journald telemetry, syslog ingestion, and daemon activity (Last 24 Hours)"
        />
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400 ring-1 ring-inset ring-amber-500/20">
            Linux Telemetry
          </span>
          <span className="inline-flex items-center rounded-md bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-300">
            24h Window
          </span>
        </div>
      </div>

      {/* Observability Status Notice */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300 flex items-start space-x-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <span className="font-semibold text-amber-200">Systemd Journald Collector Active:</span> Linux endpoints stream live systemd journal entries and authentication events. Network and firewall views report activity when matching systemd daemon logs (such as sshd, iptables, or auditd) occur.
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col justify-between">
            <span className="text-xs font-medium text-gray-400">Total Events (24h)</span>
            <div className="text-2xl font-bold text-amber-400 mt-2">
              {totalEvents.toLocaleString()}
            </div>
            <span className="text-[10px] text-gray-500 mt-1">Linux journald & syslog</span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex flex-col justify-between">
            <span className="text-xs font-medium text-gray-400">Open Alerts</span>
            <div className="text-2xl font-bold text-red-400 mt-2">
              {overview?.alerts_open ?? overview?.open_alerts ?? 0}
            </div>
            <span className="text-[10px] text-gray-500 mt-1">Active detections</span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex flex-col justify-between">
            <span className="text-xs font-medium text-gray-400">Online Agents</span>
            <div className="text-2xl font-bold text-emerald-400 mt-2">
              {agents?.online_agents ?? 0} <span className="text-xs text-gray-400 font-normal">/ {agents?.total_agents ?? 0} total</span>
            </div>
            <span className="text-[10px] text-gray-500 mt-1">Active Linux heartbeat</span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex flex-col justify-between">
            <span className="text-xs font-medium text-gray-400">Offline / Stale</span>
            <div className="text-2xl font-bold text-amber-400 mt-2">
              {agents?.offline_agents ?? 0}
            </div>
            <span className="text-[10px] text-gray-500 mt-1">Non-reporting endpoints</span>
          </CardContent>
        </Card>
      </div>

      {/* Quick Navigation Pills */}
      <div className="flex flex-wrap gap-2">
        <Link href="/linux-logs" className="px-3 py-1.5 rounded bg-gray-900 border border-gray-800 text-xs font-medium text-gray-300 hover:border-amber-500 hover:text-amber-400 transition-colors">
          Linux Logs Explorer →
        </Link>
        <Link href="/live-events?os=linux" className="px-3 py-1.5 rounded bg-gray-900 border border-gray-800 text-xs font-medium text-gray-300 hover:border-amber-500 hover:text-amber-400 transition-colors">
          Linux Live Stream →
        </Link>
        <Link href="/authentication?os=linux" className="px-3 py-1.5 rounded bg-gray-900 border border-gray-800 text-xs font-medium text-gray-300 hover:border-amber-500 hover:text-amber-400 transition-colors">
          Auth & Sudo Logs →
        </Link>
        <Link href="/processes?os=linux" className="px-3 py-1.5 rounded bg-gray-900 border border-gray-800 text-xs font-medium text-gray-300 hover:border-amber-500 hover:text-amber-400 transition-colors">
          Process Ingestion →
        </Link>
        <Link href="/network?os=linux" className="px-3 py-1.5 rounded bg-gray-900 border border-gray-800 text-xs font-medium text-gray-300 hover:border-amber-500 hover:text-amber-400 transition-colors">
          Network & SSH Ingestion →
        </Link>
        <Link href="/linux-history" className="px-3 py-1.5 rounded bg-gray-900 border border-gray-800 text-xs font-medium text-amber-400 hover:border-amber-400 transition-colors">
          Linux Event History (All Agents) →
        </Link>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeseries volume */}
        <Card className="lg:col-span-2">
          <CardHeader title="Event Volume (Last 24 Hours)" />
          <CardContent>
            {formattedTimeseries.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={formattedTimeseries}>
                    <defs>
                      <linearGradient id="linuxAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="time" stroke="#6b7280" fontSize={11} />
                    <YAxis stroke="#6b7280" fontSize={11} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111827', borderColor: '#374151' }}
                      itemStyle={{ color: '#f59e0b' }}
                    />
                    <Area type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#linuxAreaGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
                No timeseries events in the last 24h window
              </div>
            )}
          </CardContent>
        </Card>

        {/* Severity distribution */}
        <Card>
          <CardHeader title="Severity Breakdown" />
          <CardContent>
            {severityData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={severityData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {severityData.map((entry, index) => (
                        <Cell key={`sev-${index}`} fill={COLORS_SEVERITY[entry.name] || '#6b7280'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151' }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
                No severity records
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Category breakdown & Recent Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader title="Telemetry Categories" />
          <CardContent>
            {categoryData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cat-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151' }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
                No category records
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Recent Linux Journald Events">
            <Link href="/linux-logs" className="text-xs text-amber-400 hover:underline">
              View all logs →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              data={recentEvents}
              keyExtractor={(r) => r.event_id || String(r.id)}
              onRowClick={(r) => setSelectedEvent(r)}
              columns={[
                {
                  key: 'timestamp',
                  title: 'Time',
                  render: (r) => new Date(r.timestamp).toLocaleTimeString()
                },
                {
                  key: 'severity',
                  title: 'Sev',
                  render: (r) => <SeverityBadge severity={r.severity || 'INFO'} />
                },
                {
                  key: 'unit',
                  title: 'Systemd Unit / Process',
                  render: (r) => {
                    const unit = r.metadata?.UNIT || r.metadata?._SYSTEMD_UNIT || r.metadata?.SYSLOG_IDENTIFIER || r.event_type || '-'
                    return (
                      <span className="font-mono text-xs font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                        {unit}
                      </span>
                    )
                  }
                },
                {
                  key: 'hostname',
                  title: 'Host',
                  render: (r) => <span className="font-mono text-xs">{r.hostname}</span>
                },
                {
                  key: 'source',
                  title: 'Source Ingestion',
                  render: (r) => <span className="text-xs text-gray-400">{r.source || 'linux_journald'}</span>
                }
              ]}
            />
          </CardContent>
        </Card>
      </div>

      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  )
}
