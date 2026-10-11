"use client"

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { PageHeader, ErrorState, EmptyState } from '@/components/ui/States'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { DataTable } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { useDebounce } from '@/hooks/useDebounce'
import { FilterBar, FilterInput, FilterSelect } from '@/components/ui/FilterBar'
import { AddToInvestigationModal } from '@/components/ui/AddToInvestigationModal'

export default function UnifiedExplorerPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [events, setEvents] = useState<any[]>([])
  
  // Pagination
  const [page, setPage] = useState(1)
  const pageSize = 50
  const [total, setTotal] = useState(0)
  
  // Filters
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 500)
  
  const [severity, setSeverity] = useState("")
  const [sourceType, setSourceType] = useState("")
  const [os, setOs] = useState("")
  const [category, setCategory] = useState("")
  
  // Selected Event Details
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)
  const [rawPayload, setRawPayload] = useState<string | null>(null)
  const [loadingRaw, setLoadingRaw] = useState(false)
  const [showInvestigateModal, setShowInvestigateModal] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get<any>('/events', {
        page,
        page_size: pageSize,
        severity: severity || undefined,
        source_type: sourceType || undefined,
        operating_system: os || undefined,
        event_category: category || undefined,
        search: debouncedSearch || undefined
      })
      setEvents(res.items || [])
      setTotal(res.total || 0)
      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to load events")
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, severity, sourceType, os, category, debouncedSearch])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleRowClick = async (eventRow: any) => {
    setSelectedEvent(eventRow)
    setRawPayload(null)
    if (eventRow.raw_log_id) {
      try {
        setLoadingRaw(true)
        // Fix the 404 error by requesting the correct backend prefix: /raw_logs
        const res = await api.get<any>(`/raw_logs/${eventRow.raw_log_id}`)
        setRawPayload(res.raw_payload)
      } catch (err) {
        setRawPayload("Error fetching raw payload or not found.")
      } finally {
        setLoadingRaw(false)
      }
    } else {
      setRawPayload("No raw payload associated with this event.")
    }
  }

  const renderPayload = (payload: string | null) => {
    if (!payload) return ""
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
        title="Unified Events & Logs Explorer"
        description="Search and filter normalized events along with their raw forensic payloads."
      />

      <FilterBar>
        <div className="flex-1 min-w-[200px]">
          <FilterInput
            label="Search"
            value={search}
            onChange={setSearch}
            placeholder="Search hostname, IP, event type..."
          />
        </div>
        <div className="w-40">
          <FilterSelect
            label="Severity"
            value={severity}
            onChange={(val) => { setSeverity(val); setPage(1); }}
            options={[
              { value: '', label: 'All Severities' },
              { value: 'CRITICAL', label: 'Critical' },
              { value: 'HIGH', label: 'High' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'LOW', label: 'Low' },
              { value: 'INFO', label: 'Info' }
            ]}
          />
        </div>
        <div className="w-40">
          <FilterSelect
            label="OS / Source"
            value={os}
            onChange={(val) => { setOs(val); setPage(1); }}
            options={[
              { value: '', label: 'All OS' },
              { value: 'windows', label: 'Windows' },
              { value: 'linux', label: 'Linux' }
            ]}
          />
        </div>
        <div className="w-40">
          <FilterSelect
            label="Category"
            value={category}
            onChange={(val) => { setCategory(val); setPage(1); }}
            options={[
              { value: '', label: 'All Categories' },
              { value: 'authentication', label: 'Auth' },
              { value: 'process', label: 'Process' },
              { value: 'network', label: 'Network' },
              { value: 'system', label: 'System' }
            ]}
          />
        </div>
      </FilterBar>

      {error ? (
        <ErrorState message={error} retry={loadData} />
      ) : loading && events.length === 0 ? (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <TableSkeleton rows={10} columns={8} />
          </CardContent>
        </Card>
      ) : events.length === 0 ? (
        <EmptyState
          title="No events found"
          description="Adjust your filters to see more results."
        />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <DataTable
              data={events}
              keyExtractor={(r) => r.id.toString()}
              onRowClick={handleRowClick}
              columns={[
                { key: 'timestamp', title: 'Time', render: (r) => new Date(r.timestamp).toLocaleString() },
                { key: 'severity', title: 'Sev', render: (r) => <SeverityBadge severity={r.severity} /> },
                { key: 'os', title: 'OS', render: (r) => <span className="text-gray-300 font-medium">{r.operating_system || '-'}</span> },
                { key: 'hostname', title: 'Hostname', render: (r) => r.hostname || '-' },
                { key: 'category', title: 'Category', render: (r) => r.event_category || '-' },
                { key: 'event_type', title: 'Type', render: (r) => r.event_type || '-' },
                { key: 'action', title: 'Action', render: (r) => r.action || '-' },
                { key: 'username', title: 'User', render: (r) => r.username || '-' },
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

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#1e1e24] border border-gray-800 rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col shadow-xl">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-[#1e1e24] sticky top-0 rounded-t-lg z-10">
              <div className="flex items-center space-x-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">Event Detail View</h2>
                  <p className="text-sm text-gray-400 mt-1">ID: {selectedEvent.event_id}</p>
                </div>
                <button
                  onClick={() => setShowInvestigateModal(true)}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded font-medium"
                >
                  Investigate Event
                </button>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 flex flex-col lg:flex-row gap-6">
              {/* Normalized Fields Panel */}
              <div className="flex-1 space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Normalized Data</h3>
                  <div className="grid grid-cols-2 gap-4 bg-gray-900/50 p-4 rounded border border-gray-800">
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-semibold">Timestamp</label>
                      <p className="text-sm text-gray-200">{new Date(selectedEvent.timestamp).toLocaleString()}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-semibold">Hostname</label>
                      <p className="text-sm text-gray-200">{selectedEvent.hostname || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-semibold">Source Type</label>
                      <p className="text-sm text-gray-200">{selectedEvent.source_type || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-semibold">OS</label>
                      <p className="text-sm text-gray-200">{selectedEvent.operating_system || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-semibold">Source IP</label>
                      <p className="text-sm text-gray-200">{selectedEvent.source_ip || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-semibold">Username</label>
                      <p className="text-sm text-gray-200">{selectedEvent.username || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-semibold">Action</label>
                      <p className="text-sm text-gray-200">{selectedEvent.action || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-semibold">Event Type</label>
                      <p className="text-sm text-gray-200">{selectedEvent.event_type || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {selectedEvent.metadata_ && Object.keys(selectedEvent.metadata_).length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Native OS Identifiers</h3>
                    <div className="bg-[#151518] p-4 rounded-lg border border-gray-800/50">
                      <pre className="text-sm font-mono text-blue-300 whitespace-pre-wrap break-all">
                        {JSON.stringify(selectedEvent.metadata_, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>

              {/* Raw Payload Panel */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Raw Payload Evidence</h3>
                  {loadingRaw && <span className="text-xs text-blue-400 animate-pulse">Fetching...</span>}
                </div>
                <div className="bg-[#0d0d0f] p-4 rounded-lg border border-gray-800 h-full max-h-[500px] overflow-auto">
                  {rawPayload ? (
                    <pre className="text-sm font-mono text-gray-400 whitespace-pre-wrap break-all">
                      {renderPayload(rawPayload)}
                    </pre>
                  ) : loadingRaw ? (
                    <p className="text-gray-500 text-sm">Loading payload...</p>
                  ) : (
                    <p className="text-gray-500 text-sm">No payload available.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showInvestigateModal && selectedEvent && (
        <AddToInvestigationModal
          evidenceType="EVENT"
          referenceId={selectedEvent.event_id}
          defaultTitle={`Investigation: Event ${selectedEvent.event_id}`}
          onClose={() => setShowInvestigateModal(false)}
        />
      )}
    </div>
  )
}
