"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState } from '@/components/ui/States'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { TrendAreaChart, CategoryBarChart, DistributionDonutChart } from '@/components/ui/TabCharts'

export default function HostsPage() {
  const [hosts, setHosts] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadInitial = async () => {
    try {
      setLoading(true)
      const [res, statsRes] = await Promise.all([
        api.get<any>('/hosts'),
        api.get<any>('/analytics/tab-stats?tab=hosts&hours=24')
      ])
      setHosts(res.items || [])
      setStats(statsRes)
    } catch (err: any) {
      setError(err.message || "Failed to load hosts")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInitial()
  }, [])

  if (error) return <ErrorState message={error} retry={loadInitial} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hosts"
        description="Endpoint inventory"
      />

      {/* Host Inventory Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <DistributionDonutChart
          title="Endpoint Status Profile"
          subtitle="Real-time heartbeat & connectivity state"
          data={stats?.distribution1 || []}
        />
        <CategoryBarChart
          title="Telemetry Ingestion by Host"
          subtitle="Top transmitting hosts (24h)"
          data={stats?.distribution2 || []}
          color="#38bdf8"
        />
        <DistributionDonutChart
          title="Operating System Fleet"
          subtitle="Inventory by OS distribution"
          data={stats?.distribution3 || []}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && hosts.length === 0 ? (
            <TableSkeleton rows={5} columns={6} />
          ) : (
            <DataTable
              data={hosts}
              keyExtractor={(r) => r.id}
            columns={[
              { key: 'hostname', title: 'Hostname', render: (r) => (
                <Link
                  href={`/host-investigation?host=${encodeURIComponent(r.hostname || r.id)}`}
                  className="font-medium text-blue-400 hover:text-blue-300 hover:underline"
                >
                  {r.hostname}
                </Link>
              )},
              { key: 'ip_address', title: 'Primary IP', render: (r) => (
                r.ip_address ? (
                  <Link
                    href={`/ip-investigation?ip=${encodeURIComponent(r.ip_address)}`}
                    className="text-blue-400 hover:text-blue-300 hover:underline font-mono"
                  >
                    {r.ip_address}
                  </Link>
                ) : '-'
              )},
              { key: 'operating_system', title: 'OS', render: (r) => <span className="capitalize">{r.operating_system}</span> },
              { key: 'agents_count', title: 'Agents', render: (r) => (
                <div className="flex space-x-1">
                  {r.agents && r.agents.length > 0 ? (
                    r.agents.map((a: any) => (
                      <StatusBadge key={a.id} status={a.status} />
                    ))
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </div>
              )},
              { key: 'first_seen', title: 'Discovered', render: (r) => r.first_seen ? new Date(r.first_seen).toLocaleDateString() : '-' },
              { key: 'actions', title: 'Actions', render: (r) => (
                <div className="flex items-center space-x-2">
                  <Link
                    href={`/host-investigation?host=${encodeURIComponent(r.hostname || r.id)}`}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded transition-colors inline-block font-medium"
                  >
                    Investigate
                  </Link>
                  <Link
                    href={`/attack-timeline?hostname=${encodeURIComponent(r.hostname)}`}
                    className="text-xs bg-gray-800 hover:bg-indigo-600 text-gray-300 hover:text-white px-2.5 py-1 rounded transition-colors inline-block"
                  >
                    View Timeline
                  </Link>
                </div>
              )},
            ]}
          />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
