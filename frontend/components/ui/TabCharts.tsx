"use client"

import React from 'react'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

interface TimePoint {
  timestamp: string | Date
  count: number
}

interface DistItem {
  name: string
  value: number
}

const PALETTE = ['#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#14b8a6']

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#3b82f6',
  INFO: '#0ea5e9',
  UNKNOWN: '#6b7280'
}

export function TrendAreaChart({
  title,
  subtitle,
  data,
  color = '#0ea5e9',
  height = 200,
  onPointClick
}: {
  title: string
  subtitle?: string
  data: TimePoint[]
  color?: string
  height?: number
  onPointClick?: (point: TimePoint) => void
}) {
  const formattedData = (data || []).map(pt => ({
    time: pt.timestamp ? new Date(pt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
    count: pt.count,
    raw: pt
  }))

  const hasData = formattedData.some(d => d.count > 0)

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <CardContent className="pt-2">
        {!hasData ? (
          <div style={{ height }} className="flex flex-col items-center justify-center text-gray-500 text-sm">
            <svg className="w-8 h-8 mb-2 opacity-40 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            No trend telemetry recorded in selected window
          </div>
        ) : (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad-${title.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="time" stroke="#6b7280" fontSize={11} tickLine={false} />
                <YAxis stroke="#6b7280" fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.375rem', fontSize: '12px' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={color}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill={`url(#grad-${title.replace(/\s+/g, '')})`}
                  onClick={(entry: any) => onPointClick && entry && onPointClick(entry.raw || entry)}
                  cursor={onPointClick ? 'pointer' : 'default'}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function CategoryBarChart({
  title,
  subtitle,
  data,
  color = '#6366f1',
  height = 200,
  onBarClick
}: {
  title: string
  subtitle?: string
  data: DistItem[]
  color?: string
  height?: number
  onBarClick?: (item: DistItem) => void
}) {
  const hasData = (data || []).length > 0 && data.some(d => d.value > 0)

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <CardContent className="pt-2">
        {!hasData ? (
          <div style={{ height }} className="flex flex-col items-center justify-center text-gray-500 text-sm">
            <svg className="w-8 h-8 mb-2 opacity-40 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            No categorized telemetry recorded
          </div>
        ) : (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis type="number" stroke="#6b7280" fontSize={11} tickLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#9ca3af"
                  fontSize={11}
                  tickLine={false}
                  width={90}
                  tickFormatter={(val) => (String(val).length > 13 ? `${String(val).slice(0, 12)}…` : String(val))}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.375rem', fontSize: '12px' }}
                  cursor={{ fill: '#1f2937', opacity: 0.4 }}
                />
                <Bar
                  dataKey="value"
                  fill={color}
                  radius={[0, 4, 4, 0]}
                  onClick={(entry) => onBarClick && onBarClick(entry as any)}
                  cursor={onBarClick ? 'pointer' : 'default'}
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={SEVERITY_COLORS[entry.name.toUpperCase()] || PALETTE[index % PALETTE.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function DistributionDonutChart({
  title,
  subtitle,
  data,
  height = 200,
  onSliceClick
}: {
  title: string
  subtitle?: string
  data: DistItem[]
  height?: number
  onSliceClick?: (item: DistItem) => void
}) {
  const hasData = (data || []).length > 0 && data.some(d => d.value > 0)
  const total = (data || []).reduce((acc, d) => acc + d.value, 0)

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <CardContent className="pt-2">
        {!hasData ? (
          <div style={{ height }} className="flex flex-col items-center justify-center text-gray-500 text-sm">
            <svg className="w-8 h-8 mb-2 opacity-40 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
            </svg>
            No distribution events recorded
          </div>
        ) : (
          <div style={{ height }} className="flex items-center">
            <div className="w-1/2 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={height * 0.22}
                    outerRadius={height * 0.38}
                    paddingAngle={3}
                    dataKey="value"
                    onClick={(entry) => onSliceClick && onSliceClick(entry as any)}
                    cursor={onSliceClick ? 'pointer' : 'default'}
                  >
                    {data.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={SEVERITY_COLORS[entry.name.toUpperCase()] || PALETTE[index % PALETTE.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.375rem', fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-1/2 pl-2 space-y-1 overflow-y-auto max-h-48 pr-1 text-xs">
              {data.map((item, idx) => {
                const pct = total > 0 ? Math.round((item.value / total) * 100) : 0
                const color = SEVERITY_COLORS[item.name.toUpperCase()] || PALETTE[idx % PALETTE.length]
                return (
                  <div
                    key={idx}
                    onClick={() => onSliceClick && onSliceClick(item)}
                    className={`flex items-center justify-between py-0.5 px-1 rounded transition-colors ${onSliceClick ? 'hover:bg-gray-800 cursor-pointer' : ''}`}
                  >
                    <div className="flex items-center space-x-1.5 truncate max-w-[120px]">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-gray-300 truncate font-mono">{item.name}</span>
                    </div>
                    <span className="text-gray-400 tabular-nums ml-2 flex-shrink-0">
                      {item.value} ({pct}%)
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
