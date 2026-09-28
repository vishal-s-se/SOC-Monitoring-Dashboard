"use client"

import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Card, CardHeader, CardContent } from '../../components/ui/Card'

export default function MetricsPage() {
  const [overview, setOverview] = useState<any>(null)
  const [timeseries, setTimeseries] = useState<any[]>([])
  const [detections, setDetections] = useState<any>(null)
  const [hours, setHours] = useState(24)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const overviewRes = await api.get<any>(`/analytics/overview?hours=${hours}`)
        const timeseriesRes = await api.get<any>(`/analytics/timeseries?metric=events&hours=${hours}`)
        const detectionsRes = await api.get<any>(`/analytics/detections?hours=${hours}`)
        setOverview(overviewRes)
        setTimeseries(timeseriesRes.data || [])
        setDetections(detectionsRes)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [hours])

  if (loading && !overview) {
    return <div className="p-6 text-gray-400">Loading metrics...</div>
  }

  // Find max for simple bar chart scaling
  const maxEvents = timeseries.reduce((acc, curr) => Math.max(acc, curr.count), 0) || 1

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">SOC Operational Metrics</h1>
        <select
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="bg-gray-800 text-white border border-gray-700 rounded px-3 py-1"
        >
          <option value={1}>Last 1 Hour</option>
          <option value={6}>Last 6 Hours</option>
          <option value={24}>Last 24 Hours</option>
          <option value={168}>Last 7 Days</option>
        </select>
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <MetricCard title="Events Received" value={overview.events_received} color="text-blue-400" />
          <MetricCard title="Open Alerts" value={overview.alerts_open} color="text-red-400" />
          <MetricCard title="Resolved Alerts" value={overview.alerts_resolved} color="text-green-400" />
          <MetricCard title="Active Investigations" value={overview.investigations_active} color="text-purple-400" />
          <MetricCard title="Behavioral Deviations" value={overview.behavioral_deviations} color="text-yellow-400" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="h-[400px]">
          <CardHeader title="Telemetry Trend (Events)" />
          <CardContent className="h-[300px] flex items-end gap-1 overflow-x-auto pb-4">
            {timeseries.length === 0 ? (
              <div className="text-gray-500 w-full text-center mb-10">No events in this period.</div>
            ) : (
              timeseries.map((d, idx) => {
                const h = Math.max((d.count / maxEvents) * 200, 2)
                const timeStr = new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                return (
                  <div key={idx} className="flex flex-col items-center flex-1 min-w-[20px] group relative">
                    <div className="absolute bottom-[105%] hidden group-hover:block bg-gray-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-10">
                      {d.count} events<br />{timeStr}
                    </div>
                    <div 
                      className="w-full bg-blue-500 rounded-t"
                      style={{ height: `${h}px` }}
                    ></div>
                    <div className="text-[9px] text-gray-500 mt-2 truncate w-full text-center" style={{ transform: 'rotate(-45deg)' }}>
                      {timeStr}
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card className="h-[400px] overflow-hidden flex flex-col">
          <CardHeader title="Detection Rule Matches" />
          <CardContent className="flex-1 overflow-auto">
            {detections && detections.rule_matches.length > 0 ? (
              <div className="space-y-2">
                {detections.rule_matches.map((rule: any) => (
                  <div key={rule.rule_name} className="flex justify-between items-center bg-[#131111] p-3 rounded border border-gray-800">
                    <div>
                      <div className="font-semibold text-gray-200">{rule.rule_name}</div>
                      <div className="text-xs text-gray-500">Severity: {rule.severity}</div>
                    </div>
                    <div className="text-xl font-bold text-blue-400">
                      {rule.match_count}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 flex items-center justify-center h-full pb-10">No rule matches in this period.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MetricCard({ title, value, color }: { title: string, value: number, color: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex flex-col items-center justify-center h-24">
        <div className="text-sm text-gray-400 font-medium mb-1 text-center">{title}</div>
        <div className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  )
}
