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

export default function WindowsOverviewPage() {
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
        api.get<any>('/analytics/overview?hours=24&operating_system=windows'),
        api.get<any>('/analytics/telemetry?hours=24&operating_system=windows'),
        api.get<any>('/analytics/agents?operating_system=windows'),
        api.get<any>('/analytics/timeseries?metric=events&hours=24&operating_system=windows'),
        api.get<any>('/events?page=1&page_size=10&operating_system=windows')
      ])

      setOverview(overviewRes)
      setTelemetry(telemetryRes)
      setAgents(agentsRes)
      setTimeseries(timeseriesRes.data || [])
      setRecentEvents(eventsRes.items || [])
      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to load Windows overview data")
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
      if (os.includes('win')) {
        loadData()
      }
    }
  }, [lastMessage])

  if (loading) return <LoadingState message="Loading Windows overview telemetry..." />
  if (error) return <ErrorState message={error} retry={loadData} />

  const COLORS_SEVERITY: Record<string, string> = {
    CRITICAL: '#ef4444',
    HIGH: '#f97316',
    MEDIUM: '#eab308',
    LOW: '#3b82f6',
    INFO: '#0ea5e9',
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

  const CATEGORY_COLORS = ['#38bdf8', '#818cf8', '#c084fc', '#34d399', '#f472b6', '#fbbf24']

  const formattedTimeseries = timeseries.map(pt => ({
    time: new Date(pt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    count: pt.count
  }))

  const totalEvents = overview?.events_received ?? overview?.total_events ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Windows Monitoring Overview"
          description="Security telemetry, Windows Event Logs, and endpoint activity (Last 24 Hours)"
        />
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center rounded-md bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-400 ring-1 ring-inset ring-sky-500/20">
            Windows Telemetry
          </span>
          <span className="inline-flex items-center rounded-md bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-300">
            24h Window
          </span>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col justify-between">
            <span className="text-xs font-medium text-gray-400">Total Events (24h)</span>
            <div className="text-2xl font-bold text-sky-400 mt-2">
              {totalEvents.toLocaleString()}
            </div>
            <span className="text-[10px] text-gray-500 mt-1">Windows Event Log ingest</span>
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
            <span className="text-[10px] text-gray-500 mt-1">Active Windows heartbeat</span>
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
        <Link href="/windows-logs" className="px-3 py-1.5 rounded bg-gray-900 border border-gray-800 text-xs font-medium text-gray-300 hover:border-sky-500 hover:text-sky-400 transition-colors">
          Windows Event Logs →
        </Link>
        <Link href="/live-events?os=windows" className="px-3 py-1.5 rounded bg-gray-900 border border-gray-800 text-xs font-medium text-gray-300 hover:border-sky-500 hover:text-sky-400 transition-colors">
          Windows Live Stream →
        </Link>
        <Link href="/authentication?os=windows" className="px-3 py-1.5 rounded bg-gray-900 border border-gray-800 text-xs font-medium text-gray-300 hover:border-sky-500 hover:text-sky-400 transition-colors">
          Logon & Authentication (4624/4625) →
        </Link>
        <Link href="/processes?os=windows" className="px-3 py-1.5 rounded bg-gray-900 border border-gray-800 text-xs font-medium text-gray-300 hover:border-sky-500 hover:text-sky-400 transition-colors">
          Process Creation (4688) →
        </Link>
        <Link href="/network?os=windows" className="px-3 py-1.5 rounded bg-gray-900 border border-gray-800 text-xs font-medium text-gray-300 hover:border-sky-500 hover:text-sky-400 transition-colors">
          Network Connections →
        </Link>
        <Link href="/windows-history" className="px-3 py-1.5 rounded bg-gray-900 border border-gray-800 text-xs font-medium text-sky-400 hover:border-sky-400 transition-colors">
          Windows Event History (All Agents) →
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
                      <linearGradient id="winAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="time" stroke="#6b7280" fontSize={11} />
                    <YAxis stroke="#6b7280" fontSize={11} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111827', borderColor: '#374151' }}
                      itemStyle={{ color: '#0ea5e9' }}
                    />
                    <Area type="monotone" dataKey="count" stroke="#0ea5e9" strokeWidth={2} fillOpacity={1} fill="url(#winAreaGrad)" />
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
          <CardHeader title="Recent Windows Security Events">
            <Link href="/windows-logs" className="text-xs text-sky-400 hover:underline">
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
                  key: 'event_id_code',
                  title: 'EventID',
                  render: (r) => {
                    const eid = r.event_id_code ?? r.metadata?.event_id ?? r.metadata?.EventID
                    return eid ? (
                      <span className="font-mono text-xs font-semibold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">
                        {eid}
                      </span>
                    ) : <span className="text-gray-500">-</span>
                  }
                },
                {
                  key: 'channel',
                  title: 'Channel',
                  render: (r) => (
                    <span className="text-xs text-gray-300">
                      {r.channel || r.metadata?.channel || r.metadata?.Channel || 'Security'}
                    </span>
                  )
                },
                {
                  key: 'hostname',
                  title: 'Host',
                  render: (r) => <span className="font-mono text-xs">{r.hostname}</span>
                },
                {
                  key: 'event_type',
                  title: 'Type / Action',
                  render: (r) => <span className="text-xs text-gray-400">{r.event_type || r.action || '-'}</span>
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
