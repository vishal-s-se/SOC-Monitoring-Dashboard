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

function BulkRetireConfirmDialog({
  eligibleAgents,
  onConfirm,
  onCancel,
  loading,
}: {
  eligibleAgents: any[]
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-gray-900 border border-red-800/60 rounded-lg shadow-2xl w-full max-w-lg">
        <div className="p-6 space-y-4">
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-full bg-red-950/80 border border-red-600 text-red-400 font-bold text-sm">⚠️</span>
            <h3 className="text-lg font-semibold text-white">Retire All Active Agents</h3>
          </div>
          
          <div className="p-3 bg-red-950/30 border border-red-800/40 rounded text-sm text-red-200">
            <p className="font-semibold mb-1">
              {eligibleAgents.length} eligible agent{eligibleAgents.length === 1 ? '' : 's'} will be soft-retired.
            </p>
            <p className="text-xs text-red-300/90">
              Already-retired agents are excluded. Historical logs, alerts, investigations, and audit records will remain preserved.
            </p>
          </div>

          <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 bg-gray-950/70 border border-gray-800 rounded text-xs font-mono">
            {eligibleAgents.map(a => (
              <div key={a.agent_id} className="flex justify-between items-center text-gray-300 py-0.5 border-b border-gray-900">
                <span className="text-white font-medium">{a.hostname || 'Unknown'}</span>
                <span className="text-gray-400 truncate max-w-[160px]">{a.agent_id}</span>
                <span className="text-emerald-400 text-[10px] uppercase font-sans">{a.status}</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-yellow-500 bg-yellow-900/20 p-2.5 rounded border border-yellow-700/30">
            This operation will not stop local OS services or delete software on remote machines.
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
              className="px-4 py-2 text-sm font-semibold text-white bg-red-700 hover:bg-red-600 rounded transition-colors disabled:opacity-50"
            >
              {loading ? 'Retiring All…' : `Confirm Retire All (${eligibleAgents.length})`}
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
  const [showBulkRetireDialog, setShowBulkRetireDialog] = useState(false)
  const [bulkRetireLoading, setBulkRetireLoading] = useState(false)

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

  const eligibleAgents = agents.filter(a => a.status !== 'RETIRED')

  const handleBulkRetireConfirm = async () => {
    setBulkRetireLoading(true)
    try {
      const res = await api.post<any>('/agents/retire-all', {})
      setShowBulkRetireDialog(false)
      await loadAgents()
    } catch (err: any) {
      alert(err.message || 'Failed to bulk-retire agents')
    } finally {
      setBulkRetireLoading(false)
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
      {showBulkRetireDialog && (
        <BulkRetireConfirmDialog
          eligibleAgents={eligibleAgents}
          onConfirm={handleBulkRetireConfirm}
          onCancel={() => setShowBulkRetireDialog(false)}
          loading={bulkRetireLoading}
        />
      )}
      <PageHeader
        title="Agents"
        description="Manage SOC telemetry collectors deployed across your fleet"
        actions={
          <div className="flex items-center space-x-3">
            {eligibleAgents.length > 0 && (
              <button
                onClick={() => setShowBulkRetireDialog(true)}
                className="px-3.5 py-2 bg-red-950/80 hover:bg-red-900 border border-red-700/60 text-red-200 hover:text-white rounded text-sm font-medium transition-colors"
              >
                Retire All ({eligibleAgents.length})
              </button>
            )}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
            >
              Add Endpoint
            </button>
          </div>
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
