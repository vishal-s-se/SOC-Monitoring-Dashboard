"use client"

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/ui/States'
import { DataTable } from '@/components/ui/DataTable'
import { FilterBar, FilterInput, FilterSelect } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { useRouter } from 'next/navigation'

export default function InvestigationsPage() {
  const router = useRouter()
  const [investigations, setInvestigations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [total, setTotal] = useState(0)

  const [page, setPage] = useState(1)
  const pageSize = 50

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [severity, setSeverity] = useState("")

  const [debouncedSearch, setDebouncedSearch] = useState("")

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newInv, setNewInv] = useState({ title: "", description: "", severity: "MEDIUM" })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 500)
    return () => clearTimeout(handler)
  }, [search])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get<any>('/investigations', {
        page,
        page_size: pageSize,
        status: status || undefined,
        severity: severity || undefined,
        search: debouncedSearch || undefined
      })
      setInvestigations(res.items || [])
      setTotal(res.total || 0)
      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to load Investigations")
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, status, severity, debouncedSearch])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreate = async () => {
    if (!newInv.title.trim()) return
    try {
      setCreating(true)
      await api.post('/investigations', {
        title: newInv.title,
        description: newInv.description,
        severity: newInv.severity,
        status: 'OPEN'
      })
      setIsCreateModalOpen(false)
      setNewInv({ title: "", description: "", severity: "MEDIUM" })
      loadData()
    } catch (err: any) {
      alert("Failed to create investigation: " + err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <PageHeader
          title="Investigations"
          description="Manage security investigations, track evidence, and coordinate incident response."
        />
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          New Investigation
        </button>
      </div>

      <FilterBar>
        <div className="flex-1">
          <FilterInput
            label="Search"
            value={search}
            onChange={setSearch}
            placeholder="Search titles, descriptions..."
          />
        </div>
        <div className="w-48">
          <FilterSelect
            label="Status"
            value={status}
            onChange={(val) => { setStatus(val); setPage(1); }}
            options={[
              { value: 'OPEN', label: 'Open' },
              { value: 'IN_PROGRESS', label: 'In Progress' },
              { value: 'RESOLVED', label: 'Resolved' },
              { value: 'CLOSED', label: 'Closed' }
            ]}
          />
        </div>
        <div className="w-48">
          <FilterSelect
            label="Severity"
            value={severity}
            onChange={(val) => { setSeverity(val); setPage(1); }}
            options={[
              { value: 'CRITICAL', label: 'Critical' },
              { value: 'HIGH', label: 'High' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'LOW', label: 'Low' }
            ]}
          />
        </div>
      </FilterBar>

      {error ? (
        <ErrorState message={error} retry={loadData} />
      ) : loading && investigations.length === 0 ? (
        <LoadingState message="Loading Investigations..." />
      ) : investigations.length === 0 ? (
        <EmptyState
          title="No investigations found"
          description="Create a new investigation to get started."
        />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <DataTable
              data={investigations}
              keyExtractor={(r) => r.id.toString()}
              onRowClick={(r) => router.push(`/investigations/${r.id}`)}
              columns={[
                { key: 'id', title: 'ID', render: (r) => `INV-${r.id}` },
                { key: 'title', title: 'Title', render: (r) => <span className="font-medium text-white">{r.title}</span> },
                { key: 'status', title: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'severity', title: 'Severity', render: (r) => <SeverityBadge severity={r.severity} /> },
                { key: 'evidence_count', title: 'Evidence', render: (r) => <span className="text-gray-400">{r.evidence_count} items</span> },
                { key: 'assigned_to', title: 'Assigned', render: (r) => r.assigned_to || 'Unassigned' },
                { key: 'updated_at', title: 'Updated', render: (r) => new Date(r.updated_at).toLocaleString() }
              ]}
            />
            <Pagination
              currentPage={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#1e1e24] border border-gray-800 rounded-lg w-full max-w-md flex flex-col shadow-xl">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-[#1e1e24] rounded-t-lg">
              <h2 className="text-xl font-semibold text-white">Create Investigation</h2>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Title</label>
                <input
                  type="text"
                  className="w-full bg-[#151518] border border-gray-800 rounded-lg p-2 text-white"
                  value={newInv.title}
                  onChange={e => setNewInv({...newInv, title: e.target.value})}
                  placeholder="e.g. Suspicious Powershell Activity"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Description (Optional)</label>
                <textarea
                  className="w-full bg-[#151518] border border-gray-800 rounded-lg p-2 text-white h-24"
                  value={newInv.description}
                  onChange={e => setNewInv({...newInv, description: e.target.value})}
                  placeholder="Details about this investigation..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Severity</label>
                <select
                  className="w-full bg-[#151518] border border-gray-800 rounded-lg p-2 text-white"
                  value={newInv.severity}
                  onChange={e => setNewInv({...newInv, severity: e.target.value})}
                >
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-gray-800 flex justify-end space-x-3 bg-[#1e1e24] rounded-b-lg">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newInv.title.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
