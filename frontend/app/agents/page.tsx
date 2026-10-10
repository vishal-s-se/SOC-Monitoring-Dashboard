"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState } from '@/components/ui/States'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AddEndpointModal } from '@/components/ui/AddEndpointModal'
import { useWebSocket } from '@/hooks/useWebSocket'

function RetireConfirmDialog({
  agent,
  onConfirm,
  onCancel,
  loading,
}: {
  agent: any
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-gray-900 border border-red-800/50 rounded-lg shadow-xl w-full max-w-md">
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Retire Endpoint from SOC Monitor</h3>
          <div className="p-3 bg-red-900/20 border border-red-700/40 rounded text-sm text-red-300 space-y-1">
            <p><strong>Endpoint:</strong> {agent.hostname}</p>
            <p><strong>Agent ID:</strong> {agent.agent_id}</p>
            <p><strong>Current Status:</strong> {agent.status}</p>
          </div>
          <div className="text-sm text-gray-300 space-y-2">
            <p>This will mark the endpoint as <strong className="text-orange-400">RETIRED</strong> in SOC Monitor.</p>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>Historical events, logs, and investigations are preserved.</li>
              <li>The agent software <strong>is not uninstalled</strong> from the machine.</li>
              <li>A still-running agent will continue sending heartbeats; reinstall to re-enroll.</li>
            </ul>
          </div>
          <p className="text-xs text-yellow-500 bg-yellow-900/20 p-2 rounded border border-yellow-700/30">
            To completely remove the agent software, follow OS-specific uninstall instructions after retiring.
          </p>
          <div className="flex justify-end space-x-3 pt-2">
            <button
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 text-sm text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="px-4 py-2 text-sm text-white bg-red-700 hover:bg-red-600 rounded transition-colors disabled:opacity-50"
            >
              {loading ? 'Retiring…' : 'Confirm Retire'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [retireTarget, setRetireTarget] = useState<any | null>(null)
  const [retireLoading, setRetireLoading] = useState(false)

  const { lastMessage } = useWebSocket()

  const loadAgents = async () => {
    try {
      setLoading(true)
      const res = await api.get<any>('/agents/')
      setAgents(res.items || [])
    } catch (err: any) {
      setError(err.message || "Failed to load agents")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAgents()
  }, [])

  // Real-time status update and auto-add newly registered agents
  useEffect(() => {
    if (!lastMessage) return
    if (lastMessage.type === 'agent_status_changed') {
      const data = lastMessage.data
      setAgents(prev => {
        const exists = prev.some(a => a.agent_id === data.agent_id)
        if (!exists) {
          // A new agent just registered — reload to get full record
          loadAgents()
          return prev
        }
        return prev.map(a => a.agent_id === data.agent_id ? { ...a, status: data.status } : a)
      })
    }
  }, [lastMessage])

  const handleRetireConfirm = async () => {
    if (!retireTarget) return
    setRetireLoading(true)
    try {
      await api.patch(`/agents/${retireTarget.id}/retire`, {})
      setAgents(prev => prev.map(a => a.id === retireTarget.id ? { ...a, status: 'RETIRED' } : a))
      setRetireTarget(null)
    } catch (err: any) {
      alert(err.message || 'Failed to retire agent')
    } finally {
      setRetireLoading(false)
    }
  }

  if (loading) return <LoadingState message="Loading agents..." />
  if (error) return <ErrorState message={error} retry={loadAgents} />

  return (
    <div className="space-y-6">
      <AddEndpointModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false)
          loadAgents() // Refresh list after modal closes in case a new agent registered
        }}
      />
      {retireTarget && (
        <RetireConfirmDialog
          agent={retireTarget}
          onConfirm={handleRetireConfirm}
          onCancel={() => setRetireTarget(null)}
          loading={retireLoading}
        />
      )}
      <PageHeader
        title="Agents"
        description="Manage SOC telemetry collectors deployed across your fleet"
        actions={
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
          >
            Add Endpoint
          </button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            data={agents}
            keyExtractor={(r) => r.agent_id}
            columns={[
              { key: 'status', title: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'hostname', title: 'Hostname', render: (r) => (
                r.hostname ? (
                  <Link
                    href={`/host-investigation?host=${encodeURIComponent(r.hostname)}`}
                    className="font-medium text-blue-400 hover:text-blue-300 hover:underline"
                  >
                    {r.hostname}
                  </Link>
                ) : <span className="text-gray-500">-</span>
              )},
              { key: 'ip_address', title: 'IP Address', render: (r) => (
                r.ip_address ? (
                  <Link
                    href={`/ip-investigation?ip=${encodeURIComponent(r.ip_address)}`}
                    className="text-blue-400 hover:text-blue-300 hover:underline font-mono"
                  >
                    {r.ip_address}
                  </Link>
                ) : <span className="text-gray-500">-</span>
              )},
              { key: 'operating_system', title: 'OS', render: (r) => <span className="capitalize">{r.operating_system || '-'}</span> },
              { key: 'agent_version', title: 'Version', render: (r) => r.agent_version || '-' },
              {
                key: 'last_heartbeat',
                title: 'Last Heartbeat',
                render: (r) => r.last_heartbeat ? new Date(r.last_heartbeat).toLocaleString() : <span className="text-gray-500">Never</span>
              },
              { key: 'actions', title: 'Actions', render: (r) => (
                <div className="flex items-center space-x-2">
                  {r.hostname && (
                    <Link
                      href={`/host-investigation?host=${encodeURIComponent(r.hostname)}`}
                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded transition-colors inline-block font-medium"
                    >
                      Investigate
                    </Link>
                  )}
                  {r.status !== 'RETIRED' && (
                    <button
                      onClick={() => setRetireTarget(r)}
                      className="text-xs bg-red-900/40 hover:bg-red-700 border border-red-700/50 text-red-400 hover:text-white px-2.5 py-1 rounded transition-colors"
                    >
                      Retire
                    </button>
                  )}
                </div>
              )},
            ]}
          />
        </CardContent>
      </Card>
    </div>
  )
}
