"use client"

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/ui/States'
import { DataTable } from '@/components/ui/DataTable'
import { FilterBar, FilterInput, FilterSelect } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { StatusBadge } from '@/components/ui/StatusBadge'

export default function RawLogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [total, setTotal] = useState(0)

  // Pagination
  const [page, setPage] = useState(1)
  const pageSize = 50

  // Filters
  const [search, setSearch] = useState("")
  const [sourceType, setSourceType] = useState("")

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("")

  // Modal
  const [selectedLog, setSelectedLog] = useState<any | null>(null)

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
      const res = await api.get<any>('/raw-logs', {
        page,
        page_size: pageSize,
        source_type: sourceType || undefined,
        search: debouncedSearch || undefined
      })
      setLogs(res.items || [])
      setTotal(res.total || 0)
      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to load Raw Logs")
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, sourceType, debouncedSearch])

  useEffect(() => {
    loadData()
  }, [loadData])

  const renderPayload = (payload: string) => {
    try {
      const parsed = JSON.parse(payload)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return payload
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Raw Logs Evidence"
        description="Forensic view of raw telemetry before normalization."
      />

      <FilterBar>
        <div className="flex-1">
          <FilterInput
            label="Search Raw Payload / ID"
            value={search}
            onChange={setSearch}
            placeholder="Search payload content, event ID..."
          />
        </div>
        <div className="w-64">
          <FilterSelect
            label="Source Type"
            value={sourceType}
            onChange={(val) => { setSourceType(val); setPage(1); }}
            options={[
              { value: 'sysmon', label: 'Sysmon' },
              { value: 'windows_event', label: 'Windows Event' },
              { value: 'syslog', label: 'Syslog' },
              { value: 'auth', label: 'Auth Logs' }
            ]}
          />
        </div>
      </FilterBar>

      {error ? (
        <ErrorState message={error} retry={loadData} />
      ) : loading && logs.length === 0 ? (
        <LoadingState message="Loading Raw Logs..." />
      ) : logs.length === 0 ? (
        <EmptyState
          title="No raw logs found"
          description="Adjust your filters or wait for new telemetry."
        />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <DataTable
              data={logs}
              keyExtractor={(r) => r.id.toString()}
              onRowClick={setSelectedLog}
              columns={[
                { key: 'timestamp', title: 'Time', render: (r) => new Date(r.timestamp).toLocaleString() },
                { key: 'id', title: 'Log ID', render: (r) => r.id },
                { key: 'identifier', title: 'Event ID', render: (r) => r.event_identifier || '-' },
                { key: 'source', title: 'Source', render: (r) => <span className="text-gray-300 font-medium">{r.source_type}</span> },
                { key: 'status', title: 'Status', render: (r) => <StatusBadge status={r.ingestion_status || 'PENDING'} /> },
                { key: 'payload', title: 'Payload Snippet', render: (r) => (
                  <span className="truncate max-w-md block text-gray-400 font-mono text-xs">
                    {r.raw_payload ? (r.raw_payload.length > 80 ? r.raw_payload.substring(0, 80) + '...' : r.raw_payload) : 'N/A'}
                  </span>
                )}
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

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#1e1e24] border border-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-[#1e1e24] sticky top-0 rounded-t-lg z-10">
              <div>
                <h2 className="text-xl font-semibold text-white">Raw Log Evidence</h2>
                <p className="text-sm text-gray-400 mt-1">ID: {selectedLog.id} • {selectedLog.event_identifier}</p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold">Timestamp</label>
                  <p className="text-sm text-gray-200 mt-1">{new Date(selectedLog.timestamp).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold">Received At</label>
                  <p className="text-sm text-gray-200 mt-1">{selectedLog.received_at ? new Date(selectedLog.received_at).toLocaleString() : 'N/A'}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold">Source Type</label>
                  <p className="text-sm text-gray-200 mt-1">{selectedLog.source_type}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold">Ingestion Status</label>
                  <p className="mt-1"><StatusBadge status={selectedLog.ingestion_status || 'PENDING'} /></p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold">Agent ID</label>
                  <p className="text-sm text-gray-200 mt-1">{selectedLog.agent_id || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold">Host ID</label>
                  <p className="text-sm text-gray-200 mt-1">{selectedLog.host_id || 'N/A'}</p>
                </div>
              </div>

              <div className="mt-6">
                <label className="text-xs text-gray-500 uppercase font-semibold flex items-center justify-between mb-2">
                  <span>Raw Payload</span>
                  <span className="text-yellow-500/80 bg-yellow-500/10 px-2 py-0.5 rounded text-[10px]">EVIDENCE</span>
                </label>
                <div className="bg-[#151518] p-4 rounded-lg border border-gray-800/50">
                  <pre className="text-sm font-mono text-gray-300 whitespace-pre-wrap overflow-auto max-h-96">
                    {renderPayload(selectedLog.raw_payload)}
                  </pre>
                </div>
              </div>

              {selectedLog.metadata_ && Object.keys(selectedLog.metadata_).length > 0 && (
                <div className="mt-6">
                  <label className="text-xs text-gray-500 uppercase font-semibold mb-2 block">Processing Metadata</label>
                  <div className="bg-[#151518] p-4 rounded-lg border border-gray-800/50">
                    <pre className="text-sm font-mono text-gray-400 whitespace-pre-wrap overflow-auto">
                      {JSON.stringify(selectedLog.metadata_, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
