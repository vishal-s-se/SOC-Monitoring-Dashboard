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
import { ClearLogsButton } from '@/components/ui/ClearLogsButton'
import { TrendAreaChart, CategoryBarChart, DistributionDonutChart } from '@/components/ui/TabCharts'

export default function UnifiedExplorerPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>(null)
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
  const [payloadCopied, setPayloadCopied] = useState(false)
  const [idCopied, setIdCopied] = useState(false)

  // Scoped Log Deletion Modal State
  const [showClearModal, setShowClearModal] = useState(false)
  const [clearingLogs, setClearingLogs] = useState(false)
  const [clearConfirmationText, setClearConfirmationText] = useState("")
  const [clearResultMsg, setClearResultMsg] = useState("")

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [res, statsRes] = await Promise.all([
        api.get<any>('/events', {
          page,
          page_size: pageSize,
          severity: severity || undefined,
          source_type: sourceType || undefined,
          operating_system: os || undefined,
          event_category: category || undefined,
          search: debouncedSearch || undefined
        }),
        api.get<any>(`/analytics/tab-stats?tab=unified&hours=24${os ? `&operating_system=${os}` : ''}`)
      ])
      setEvents(res.items || [])
      setTotal(res.total || 0)
      setStats(statsRes)
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

      {/* Cross-Platform Unified Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TrendAreaChart
          title="Global Event Flow (24h)"
          subtitle="Cross-platform hourly ingestion trajectory"
          data={stats?.timeseries || []}
          color="#3b82f6"
        />
        <DistributionDonutChart
          title="Operating System Share"
          subtitle="Windows vs Linux event volumes"
          data={stats?.distribution1 || []}
          onSliceClick={(item) => {
            setOs(item.name.toLowerCase().includes('win') ? 'windows' : 'linux')
            setPage(1)
          }}
        />
        <CategoryBarChart
          title="Severity & Risk Profile"
          subtitle="Severity distribution across endpoints"
          data={stats?.distribution2 || []}
          color="#ec4899"
        />
      </div>

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
        <div className="flex items-end space-x-2">
          <button
            type="button"
            onClick={() => {
              setSearch("")
              setSeverity("")
              setSourceType("")
              setOs("")
              setCategory("")
              setPage(1)
            }}
            className="px-3 py-2 text-xs font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded transition-colors"
            title="Reset active search and dropdown filters"
          >
            Clear Filters
          </button>
          <ClearLogsButton
            operatingSystem={os || "all"}
            tabCategory={category || "all"}
            tabTitle="Unified Explorer"
            onCleared={loadData}
            activeFilters={{ OS: os || 'All', Category: category || 'All', Severity: severity || 'All' }}
          />
          <button
            type="button"
            onClick={() => setShowClearModal(true)}
            className="px-3 py-2 text-xs font-medium text-red-300 hover:text-red-100 bg-red-950/60 hover:bg-red-900/60 border border-red-800/80 rounded transition-colors"
            title="Permanently delete persisted logs within currently active scope"
          >
            Clear Scoped Logs
          </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/70 backdrop-blur-sm p-3 sm:p-4 md:p-6">
          <div 
            className="bg-[#1e1e24] border border-gray-800 rounded-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden min-w-0"
            style={{ width: 'min(75vw, 1400px)', minWidth: 'min(100%, 360px)' }}
          >
            {/* Header - Responsive Grid Layout */}
            <div className="p-4 sm:p-5 border-b border-gray-800 bg-[#1e1e24] sticky top-0 rounded-t-lg z-10 min-w-0">
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 items-start min-w-0">
                {/* Left Section: Title and Event Identifier */}
                <div className="min-w-0 flex flex-col gap-1.5">
                  <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight shrink-0">
                    Event Detail View
                  </h2>
                  {selectedEvent.event_id && (
                    <div className="flex items-start gap-1.5 text-xs text-gray-400 min-w-0 bg-gray-900/80 px-2.5 py-1.5 rounded border border-gray-800">
                      <span className="text-gray-500 font-semibold shrink-0 mt-0.5">ID:</span>
                      <span 
                        className="font-mono text-gray-300 break-all select-all flex-1 min-w-0"
                        style={{ overflowWrap: 'anywhere' }}
                        title={selectedEvent.event_id}
                      >
                        {selectedEvent.event_id}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedEvent.event_id)
                          setIdCopied(true)
                          setTimeout(() => setIdCopied(false), 2000)
                        }}
                        className="text-gray-400 hover:text-white p-0.5 shrink-0 transition-colors rounded hover:bg-gray-800"
                        title="Copy Event ID"
                      >
                        {idCopied ? (
                          <span className="text-[10px] text-green-400 font-medium">Copied!</span>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth="2"></rect>
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2"></path>
                          </svg>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Right Section: Action Buttons and Close */}
                <div className="flex items-center flex-wrap gap-2 shrink-0 justify-start md:justify-end">
                  <button
                    type="button"
                    onClick={() => setShowInvestigateModal(true)}
                    className="text-xs bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-3 py-1.5 rounded font-medium transition-colors inline-flex items-center gap-1.5 shadow-sm whitespace-nowrap"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Investigate Event</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedEvent(null)}
                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
                    title="Close modal"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto overflow-x-hidden flex-1 flex flex-col lg:flex-row gap-6 min-w-0">
              {/* Normalized Fields Panel */}
              <div className="flex-1 space-y-6 min-w-0">
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Normalized Data</h3>
                  <div className="grid grid-cols-2 gap-4 bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                    <div className="min-w-0">
                      <label className="text-[11px] text-gray-500 uppercase font-semibold block">Timestamp</label>
                      <p className="text-sm text-gray-200 mt-0.5 truncate" title={new Date(selectedEvent.timestamp).toLocaleString()}>{new Date(selectedEvent.timestamp).toLocaleString()}</p>
                    </div>
                    <div className="min-w-0">
                      <label className="text-[11px] text-gray-500 uppercase font-semibold block">Hostname</label>
                      <p className="text-sm text-gray-200 mt-0.5 truncate" title={selectedEvent.hostname}>{selectedEvent.hostname || 'N/A'}</p>
                    </div>
                    <div className="min-w-0">
                      <label className="text-[11px] text-gray-500 uppercase font-semibold block">Source Type</label>
                      <p className="text-sm text-gray-200 mt-0.5 truncate">{selectedEvent.source_type || 'N/A'}</p>
                    </div>
                    <div className="min-w-0">
                      <label className="text-[11px] text-gray-500 uppercase font-semibold block">OS</label>
                      <p className="text-sm text-gray-200 mt-0.5 truncate">{selectedEvent.operating_system || 'N/A'}</p>
                    </div>
                    <div className="min-w-0">
                      <label className="text-[11px] text-gray-500 uppercase font-semibold block">Source IP</label>
                      <p className="text-sm text-gray-200 mt-0.5 font-mono truncate">{selectedEvent.source_ip || 'N/A'}</p>
                    </div>
                    <div className="min-w-0">
                      <label className="text-[11px] text-gray-500 uppercase font-semibold block">Username</label>
                      <p className="text-sm text-gray-200 mt-0.5 truncate">{selectedEvent.username || 'N/A'}</p>
                    </div>
                    <div className="min-w-0">
                      <label className="text-[11px] text-gray-500 uppercase font-semibold block">Action</label>
                      <p className="text-sm text-gray-200 mt-0.5 truncate">{selectedEvent.action || 'N/A'}</p>
                    </div>
                    <div className="min-w-0">
                      <label className="text-[11px] text-gray-500 uppercase font-semibold block">Event Type</label>
                      <p className="text-sm text-gray-200 mt-0.5 truncate">{selectedEvent.event_type || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {selectedEvent.metadata_ && Object.keys(selectedEvent.metadata_).length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Native OS Identifiers</h3>
                    <div className="bg-[#151518] p-4 rounded-lg border border-gray-800/50 overflow-hidden">
                      <pre className="text-xs font-mono text-blue-300 whitespace-pre-wrap break-all max-h-60 overflow-auto">
                        {JSON.stringify(selectedEvent.metadata_, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>

              {/* Raw Payload Panel */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Raw Payload Evidence</h3>
                    {loadingRaw && <span className="text-xs text-blue-400 animate-pulse">Fetching...</span>}
                  </div>
                  {rawPayload && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(renderPayload(rawPayload))
                        setPayloadCopied(true)
                        setTimeout(() => setPayloadCopied(false), 2000)
                      }}
                      className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-2.5 py-1 rounded transition-colors inline-flex items-center gap-1.5"
                    >
                      {payloadCopied ? (
                        <span className="text-green-400 font-medium">Copied!</span>
                      ) : (
                        <span>Copy Payload</span>
                      )}
                    </button>
                  )}
                </div>
                <div className="bg-[#0d0d0f] p-4 rounded-lg border border-gray-800 max-h-[500px] overflow-auto">
                  {rawPayload ? (
                    <pre className="text-xs sm:text-sm font-mono text-gray-300 whitespace-pre-wrap break-all sm:break-words">
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

      {/* Scoped Log Deletion Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-gray-900 border border-red-800/80 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-red-400">
              <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-base font-bold text-white">Confirm Scoped Log Deletion</h3>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              This action permanently purges persisted raw events from the PostgreSQL database within the currently filtered scope.
              Alerts, investigations, and agent enrollment states will <span className="font-semibold text-green-400">remain untouched</span>.
            </p>

            <div className="p-3 bg-gray-950 border border-gray-800 rounded-md text-xs space-y-1 font-mono">
              <div className="text-gray-400">Active Scope:</div>
              <div>• Category: <span className="text-cyan-400">{category || "All Categories"}</span></div>
              <div>• OS / Platform: <span className="text-cyan-400">{os || "All Operating Systems"}</span></div>
              <div>• Estimated affected records: <span className="text-red-400 font-bold">{total}</span></div>
            </div>

            <div>
              <label className="block text-xs text-gray-300 mb-1">
                Type <span className="font-bold text-red-400">CONFIRM-DELETE</span> below to proceed:
              </label>
              <input
                type="text"
                value={clearConfirmationText}
                onChange={e => setClearConfirmationText(e.target.value)}
                placeholder="CONFIRM-DELETE"
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-red-500 font-mono"
              />
            </div>

            {clearResultMsg && (
              <div className="p-2 bg-blue-950/80 border border-blue-800 rounded text-xs text-blue-200">
                {clearResultMsg}
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-3 border-t border-gray-800">
              <button
                type="button"
                onClick={() => {
                  setShowClearModal(false)
                  setClearConfirmationText("")
                  setClearResultMsg("")
                }}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearConfirmationText !== "CONFIRM-DELETE" || clearingLogs}
                onClick={async () => {
                  try {
                    setClearingLogs(true)
                    const params: Record<string, string> = { confirm: "true" }
                    if (category) params.event_category = category
                    if (os) params.operating_system = os
                    
                    const queryStr = new URLSearchParams(params).toString()
                    const res = await api.delete<any>(`/events/scoped-clear?${queryStr}`)
                    setClearResultMsg(`Success: ${res.records_deleted} records deleted.`)
                    setTimeout(() => {
                      setShowClearModal(false)
                      setClearConfirmationText("")
                      setClearResultMsg("")
                      loadData()
                    }, 1500)
                  } catch (err: any) {
                    setClearResultMsg(`Error: ${err.message || 'Deletion failed'}`)
                  } finally {
                    setClearingLogs(false)
                  }
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white rounded text-xs font-bold transition-all"
              >
                {clearingLogs ? "Deleting..." : "Permanently Delete Scoped Logs"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
