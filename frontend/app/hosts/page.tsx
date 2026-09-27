"use client"

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState } from '@/components/ui/States'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'

export default function HostsPage() {
  const [hosts, setHosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadInitial = async () => {
    try {
      setLoading(true)
      const res = await api.get<any>('/hosts')
      setHosts(res.items || [])
    } catch (err: any) {
      setError(err.message || "Failed to load hosts")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInitial()
  }, [])

  if (loading) return <LoadingState message="Loading hosts..." />
  if (error) return <ErrorState message={error} retry={loadInitial} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hosts"
        description="Endpoint inventory"
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            data={hosts}
            keyExtractor={(r) => r.id}
            columns={[
              { key: 'hostname', title: 'Hostname', render: (r) => <span className="font-medium text-gray-200">{r.hostname}</span> },
              { key: 'ip_address', title: 'Primary IP', render: (r) => r.ip_address || '-' },
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
            ]}
          />
        </CardContent>
      </Card>
    </div>
  )
}
