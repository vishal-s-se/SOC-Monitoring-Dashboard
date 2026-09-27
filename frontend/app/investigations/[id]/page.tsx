"use client"

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { DataTable } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

import { EventDetailsModal } from '@/components/ui/EventDetailsModal'
import { AlertDetailsModal } from '@/components/ui/AlertDetailsModal'
import { RawLogDetailsModal } from '@/components/ui/RawLogDetailsModal'

export default function InvestigationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [inv, setInv] = useState<any>(null)
  const [context, setContext] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [newNote, setNewNote] = useState("")
  const [addingNote, setAddingNote] = useState(false)

  const [status, setStatus] = useState("")
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Resolution Modal
  const [showResModal, setShowResModal] = useState(false)
  const [pendingStatus, setPendingStatus] = useState("")
  const [resolutionText, setResolutionText] = useState("")

  // Assignment Modal
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignee, setAssignee] = useState("")

  // Modals
  const [viewEvent, setViewEvent] = useState<any>(null)
  const [viewAlert, setViewAlert] = useState<any>(null)
  const [viewRawLog, setViewRawLog] = useState<any>(null)

  // Related events
  const [relatedEvents, setRelatedEvents] = useState<any[]>([])
  const [loadingRelated, setLoadingRelated] = useState(false)
  const [relatedContextStr, setRelatedContextStr] = useState("")
  const [currentEvidenceId, setCurrentEvidenceId] = useState<number | null>(null)

  // Controls for Related Events
  const [timeWindow, setTimeWindow] = useState<number>(15)
  const [correlationKeys, setCorrelationKeys] = useState<string>("")
  const [relatedTypeFilter, setRelatedTypeFilter] = useState("")
  const [relatedSeverityFilter, setRelatedSeverityFilter] = useState("")

  const [relatedPage, setRelatedPage] = useState(1)
  const [relatedPageSize] = useState(15)
  const [relatedTotal, setRelatedTotal] = useState(0)

  const fetchCorrelatedEvents = useCallback(async (evidenceId: number, tWindow: number, keys: string, typeF: string, sevF: string, p: number) => {
    try {
      setLoadingRelated(true)
      const query: any = {
        evidence_id: evidenceId,
        time_window_minutes: tWindow,
        page: p,
        page_size: relatedPageSize
      }
      if (keys) query.correlation_keys = keys
      if (typeF) query.event_type = typeF
      if (sevF) query.severity = sevF

      const res = await api.get<any>(`/investigations/${id}/correlated-events`, query)
      setRelatedEvents(res.items || [])
      setRelatedTotal(res.total || 0)
    } catch (err: any) {
      setRelatedEvents([])
      setRelatedTotal(0)
    } finally {
      setLoadingRelated(false)
    }
  }, [id, relatedPageSize])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get<any>(`/investigations/${id}`)
      setInv(res)
      setStatus(res.status)

      const ctx = await api.get<any>(`/investigations/${id}/context`)
      setContext(ctx)

      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to load Investigation")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (currentEvidenceId !== null) {
      fetchCorrelatedEvents(currentEvidenceId, timeWindow, correlationKeys, relatedTypeFilter, relatedSeverityFilter, relatedPage)
    }
  }, [currentEvidenceId, timeWindow, correlationKeys, relatedTypeFilter, relatedSeverityFilter, relatedPage, fetchCorrelatedEvents])

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    try {
      setAddingNote(true)
      await api.post(`/investigations/${id}/notes`, {
        content: newNote,
        author: "Analyst"
      })
      setNewNote("")
      loadData()
    } catch (err: any) {
      alert("Failed to add note: " + err.message)
    } finally {
      setAddingNote(false)
    }
  }

  const handleStatusSelect = (newStatus: string) => {
    if (newStatus === 'RESOLVED' || newStatus === 'CLOSED') {
      setPendingStatus(newStatus)
      setResolutionText(inv.resolution || "")
      setShowResModal(true)
    } else {
      updateStatusAPI(newStatus)
    }
  }

  const updateStatusAPI = async (newStatus: string, resText?: string) => {
    try {
      setUpdatingStatus(true)
      await api.post(`/investigations/${id}/status`, {
        status: newStatus,
        resolution: resText
      })
      setStatus(newStatus)
      setShowResModal(false)
      loadData()
    } catch (err: any) {
      alert("Failed to update status: " + err.message)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleAssign = async () => {
    try {
      await api.patch(`/investigations/${id}`, {
        assigned_to: assignee || null
      })
      setShowAssignModal(false)
      loadData()
    } catch (err: any) {
      alert("Failed to assign: " + err.message)
    }
  }

  const removeEvidence = async (evidenceId: number) => {
    if (!confirm("Remove this evidence from the investigation?\n\nThe underlying event will not be deleted.")) return
    try {
      await api.delete(`/investigations/${id}/evidence/${evidenceId}`)
      if (currentEvidenceId === evidenceId) {
        setCurrentEvidenceId(null)
        setRelatedEvents([])
        setRelatedTotal(0)
        setRelatedContextStr("")
      }
      loadData()
    } catch (err: any) {
      alert("Failed to remove evidence: " + err.message)
    }
  }

  const handleLoadRelated = (evidenceId: number, data: any) => {
    setCurrentEvidenceId(evidenceId)
    setRelatedPage(1)

    let desc = `Source context: `
    if (data.hostname) desc += data.hostname
    else if (data.agent_id) desc += `Agent ${data.agent_id}`
    else if (data.source_ip) desc += `IP ${data.source_ip}`
    else if (data.event_identifier) desc += `Event ${data.event_identifier}`
    else desc += `Item ID ${data.id}`
    setRelatedContextStr(desc)
  }

  const evidenceCounts = context
    ? `${context.alerts.length} Alerts | ${context.events.length} Events | ${context.raw_logs.length} Raw Logs | ${context.hosts.length} Hosts | ${context.agents.length} Agents`
    : `${inv?.evidence?.length || 0} Total Items`

  if (loading && !inv) return <LoadingState message="Loading Investigation details..." />
  if (error) return <ErrorState message={error} retry={loadData} />
  if (!inv) return <EmptyState title="Not Found" description="Investigation not found." />

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center space-x-4 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-white transition-colors">
          ← Back
        </button>
        <div className="flex-1">
          <div className="text-xs text-gray-500 mb-1">
            <Link href="/investigations" className="hover:text-blue-400">Investigations</Link>
            <span className="mx-2">→</span>
            <span>INV-{inv.id}</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{inv.title}</h1>
        </div>
        <div className="flex space-x-3 items-center">
          <SeverityBadge severity={inv.severity} />
          <select
            value={status}
            onChange={e => handleStatusSelect(e.target.value)}
            disabled={updatingStatus}
            className="bg-[#151518] border border-gray-800 rounded-lg p-2 text-white text-sm"
          >
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader title="Summary" />
            <CardContent>
              <p className="text-gray-300 whitespace-pre-wrap">{inv.description || "No description provided."}</p>
              {inv.resolution && (
                <div className="mt-4 p-4 bg-green-900/20 border border-green-800/50 rounded-lg">
                  <h4 className="text-sm font-semibold text-green-400 mb-1">Resolution</h4>
                  <p className="text-gray-300">{inv.resolution}</p>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6 pt-4 border-t border-gray-800/50">
                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold">Created</label>
                  <p className="text-sm text-gray-300 mt-1">{new Date(inv.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold">Updated</label>
                  <p className="text-sm text-gray-300 mt-1">{new Date(inv.updated_at).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold flex justify-between items-center">
                    Assigned To
                    <button onClick={() => {setAssignee(inv.assigned_to || ""); setShowAssignModal(true)}} className="text-[10px] text-blue-400 hover:text-blue-300 ml-2">Edit</button>
                  </label>
                  <p className="text-sm text-gray-300 mt-1">{inv.assigned_to || 'Unassigned'}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 uppercase font-semibold">Evidence Counts</label>
                  <p className="text-sm text-gray-300 mt-1">{evidenceCounts}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Grouped Evidence" />
            <CardContent className="p-0">
              {!context ? (
                <div className="p-6 text-center text-gray-500">Loading context...</div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {context.alerts.length > 0 && (
                    <div className="p-4">
                      <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Alerts ({context.alerts.length})</h3>
                      <div className="space-y-2">
                        {context.alerts.map((item: any) => (
                          <div key={item.evidence_id} className="flex items-center justify-between bg-[#151518] p-3 rounded border border-gray-800/50">
                            <div>
                              <div className="flex items-center space-x-2 mb-1">
                                <SeverityBadge severity={item.data.severity} />
                                <span className="text-sm font-medium text-white">{item.data.title}</span>
                              </div>
                              <div className="text-xs text-gray-500">
                                ID: {item.data.id} • {item.data.last_seen ? new Date(item.data.last_seen).toLocaleString() : 'N/A'} • {item.data.status}
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button onClick={() => handleLoadRelated(item.evidence_id, item.data)} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded">Related Events</button>
                              <button onClick={() => setViewAlert(item.data)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded">View</button>
                              <button onClick={() => removeEvidence(item.evidence_id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {context.events.length > 0 && (
                    <div className="p-4">
                      <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Events ({context.events.length})</h3>
                      <div className="space-y-2">
                        {context.events.map((item: any) => (
                          <div key={item.evidence_id} className="flex items-center justify-between bg-[#151518] p-3 rounded border border-gray-800/50">
                            <div>
                              <div className="flex items-center space-x-2 mb-1">
                                <SeverityBadge severity={item.data.severity || 'INFO'} />
                                <span className="text-sm font-medium text-white">{item.data.event_type}</span>
                              </div>
                              <div className="text-xs text-gray-500">
                                {new Date(item.data.timestamp).toLocaleString()} • Src: {item.data.source_ip || 'N/A'}
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button onClick={() => handleLoadRelated(item.evidence_id, item.data)} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded">Related Events</button>
                              <button onClick={() => setViewEvent(item.data)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded">View</button>
                              <button onClick={() => removeEvidence(item.evidence_id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {context.raw_logs.length > 0 && (
                    <div className="p-4">
                      <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Raw Logs ({context.raw_logs.length})</h3>
                      <div className="space-y-2">
                        {context.raw_logs.map((item: any) => (
                          <div key={item.evidence_id} className="flex items-center justify-between bg-[#151518] p-3 rounded border border-gray-800/50">
                            <div>
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-sm font-medium text-white">Log ID: {item.data.id}</span>
                                <span className="text-xs bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded">{item.data.source_type}</span>
                              </div>
                              <div className="text-xs text-gray-500">
                                {new Date(item.data.timestamp).toLocaleString()} • Agent: {item.data.agent_id}
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button onClick={() => handleLoadRelated(item.evidence_id, item.data)} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded">Related Events</button>
                              <button onClick={() => setViewRawLog(item.data)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded">View</button>
                              <button onClick={() => removeEvidence(item.evidence_id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {context.hosts.length > 0 && (
                    <div className="p-4">
                      <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Hosts ({context.hosts.length})</h3>
                      <div className="space-y-2">
                        {context.hosts.map((item: any) => (
                          <div key={item.evidence_id} className="flex items-center justify-between bg-[#151518] p-3 rounded border border-gray-800/50">
                            <div>
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-sm font-medium text-white">{item.data.hostname}</span>
                                <StatusBadge status={item.data.status || 'UNKNOWN'} />
                              </div>
                              <div className="text-xs text-gray-500">
                                IP: {item.data.ip_address || 'Unknown'}
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button onClick={() => handleLoadRelated(item.evidence_id, item.data)} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded">Related Events</button>
                              <Link href="/hosts" className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded flex items-center justify-center">View</Link>
                              <button onClick={() => removeEvidence(item.evidence_id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {context.agents.length > 0 && (
                    <div className="p-4">
                      <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Agents ({context.agents.length})</h3>
                      <div className="space-y-2">
                        {context.agents.map((item: any) => (
                          <div key={item.evidence_id} className="flex items-center justify-between bg-[#151518] p-3 rounded border border-gray-800/50">
                            <div>
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-sm font-medium text-white">Agent: {item.data.agent_id}</span>
                                <StatusBadge status={item.data.status || 'OFFLINE'} />
                              </div>
                              <div className="text-xs text-gray-500">
                                {item.data.hostname} • OS: {item.data.operating_system || 'N/A'}
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button onClick={() => handleLoadRelated(item.evidence_id, item.data)} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded">Related Events</button>
                              <Link href="/agents" className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded flex items-center justify-center">View</Link>
                              <button onClick={() => removeEvidence(item.evidence_id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {context.alerts.length === 0 && context.events.length === 0 && context.raw_logs.length === 0 && context.hosts.length === 0 && context.agents.length === 0 && (
                    <div className="p-6 text-center text-gray-500">No evidence added to this investigation.</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Related Events (Deterministic Correlation)" />
            <CardContent className="p-0">
              {!currentEvidenceId ? (
                <div className="p-6 text-center text-gray-500">
                  Click &quot;Related Events&quot; on any evidence item above to view context.
                </div>
              ) : (
                <div>
                  <div className="p-4 bg-[#151518] border-b border-gray-800 flex flex-wrap gap-4 items-center">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Time Window</label>
                      <select
                        value={timeWindow}
                        onChange={e => { setTimeWindow(Number(e.target.value)); setRelatedPage(1); }}
                        className="bg-gray-900 border border-gray-700 rounded p-1 text-sm text-white focus:outline-none"
                      >
                        <option value={5}>± 5 mins</option>
                        <option value={15}>± 15 mins</option>
                        <option value={30}>± 30 mins</option>
                        <option value={60}>± 60 mins</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Correlation By</label>
                      <select
                        value={correlationKeys}
                        onChange={e => { setCorrelationKeys(e.target.value); setRelatedPage(1); }}
                        className="bg-gray-900 border border-gray-700 rounded p-1 text-sm text-white focus:outline-none"
                      >
                        <option value="">All Available</option>
                        <option value="host">Host</option>
                        <option value="agent">Agent</option>
                        <option value="source_ip">Source IP</option>
                        <option value="destination_ip">Destination IP</option>
                        <option value="username">Username</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-gray-400 text-right mt-4">{relatedContextStr}</div>
                    </div>
                  </div>

                  {loadingRelated ? (
                    <div className="p-6 text-center text-gray-500">Loading correlated events...</div>
                  ) : relatedEvents.length === 0 ? (
                    <div className="p-6 text-center text-gray-500">
                      No related events found for the selected context.
                    </div>
                  ) : (
                    <div>
                      <DataTable
                        data={relatedEvents}
                        keyExtractor={(r: any) => r.id.toString()}
                        onRowClick={setViewEvent}
                        columns={[
                          { key: 'timestamp', title: 'Time', render: (r: any) => new Date(r.timestamp).toLocaleTimeString() },
                          { key: 'type', title: 'Type', render: (r: any) => r.event_type || '-' },
                          { key: 'host', title: 'Host', render: (r: any) => r.hostname || '-' },
                          { key: 'ip', title: 'Src IP', render: (r: any) => r.source_ip || '-' },
                          { key: 'reason', title: 'Reason', render: (r: any) => <span className="text-green-400 font-medium text-xs">{r.correlation_reason || '-'}</span> },
                          { key: 'severity', title: 'Sev', render: (r: any) => <SeverityBadge severity={r.severity || 'INFO'} /> }
                        ]}
                      />
                      <Pagination
                        currentPage={relatedPage}
                        pageSize={relatedPageSize}
                        total={relatedTotal}
                        onPageChange={setRelatedPage}
                      />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="h-[400px] flex flex-col">
            <CardHeader title="Analyst Notes" />
            <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {inv.notes && inv.notes.length > 0 ? (
                  inv.notes.map((note: any) => (
                    <div key={note.id} className="bg-[#151518] p-4 rounded-lg border border-gray-800/50">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-semibold text-blue-400">{note.author || 'Analyst'}</span>
                        <span className="text-xs text-gray-500">{new Date(note.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-gray-300 whitespace-pre-wrap">{note.content}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-500 mt-10">No analyst notes yet.</div>
                )}
              </div>
              <div className="p-4 border-t border-gray-800 bg-[#1e1e24]">
                <textarea
                  className="w-full bg-[#151518] border border-gray-800 rounded-lg p-2 text-white h-20 text-sm mb-2"
                  placeholder="Add a new note..."
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                />
                <button
                  onClick={handleAddNote}
                  disabled={addingNote || !newNote.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {addingNote ? 'Adding...' : 'Add Note'}
                </button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Workflow History" />
            <CardContent className="p-0">
              <div className="p-4 max-h-[400px] overflow-y-auto">
                {inv.history && inv.history.length > 0 ? (
                  <div className="space-y-3">
                    {inv.history.map((h: any) => (
                      <div key={h.id} className="text-sm flex flex-col space-y-1 p-2 bg-[#151518] rounded border border-gray-800">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-300">{h.changed_by || 'System'}</span>
                          <span className="text-xs text-gray-500">{new Date(h.created_at).toLocaleString()}</span>
                        </div>
                        <div className="text-gray-400 text-xs">
                          Changed status from <span className="text-white">{h.previous_status || '-'}</span> to <span className="text-white">{h.new_status}</span>
                        </div>
                        {h.reason && <div className="text-gray-400 text-xs mt-1 italic">&quot;{h.reason}&quot;</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 text-sm">No workflow history available.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {showResModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#1e1e24] border border-gray-800 rounded-lg w-full max-w-md flex flex-col shadow-xl">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#1e1e24] rounded-t-lg">
              <h2 className="text-lg font-semibold text-white">Investigation Resolution</h2>
              <button onClick={() => {setShowResModal(false); setStatus(inv.status);}} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-400 mb-2">Resolution Summary</label>
              <textarea
                className="w-full bg-[#151518] border border-gray-800 rounded-lg p-3 text-white text-sm h-32"
                placeholder="Investigation completed after review..."
                value={resolutionText}
                onChange={e => setResolutionText(e.target.value)}
              />
            </div>
            <div className="p-4 border-t border-gray-800 flex justify-end space-x-3 bg-[#1e1e24] rounded-b-lg">
              <button onClick={() => {setShowResModal(false); setStatus(inv.status);}} className="px-4 py-2 text-gray-400 hover:text-white text-sm font-medium">Cancel</button>
              <button onClick={() => updateStatusAPI(pendingStatus, resolutionText)} disabled={updatingStatus} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">Save & {pendingStatus === 'RESOLVED' ? 'Resolve' : 'Close'}</button>
            </div>
          </div>
        </div>
      )}

      {showAssignModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#1e1e24] border border-gray-800 rounded-lg w-full max-w-md flex flex-col shadow-xl">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#1e1e24] rounded-t-lg">
              <h2 className="text-lg font-semibold text-white">Assign Analyst</h2>
              <button onClick={() => setShowAssignModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-400 mb-2">Assignee Name</label>
              <input
                type="text"
                className="w-full bg-[#151518] border border-gray-800 rounded-lg p-2 text-white text-sm"
                placeholder="e.g. John Doe, unassigned..."
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
              />
            </div>
            <div className="p-4 border-t border-gray-800 flex justify-end space-x-3 bg-[#1e1e24] rounded-b-lg">
              <button onClick={() => setShowAssignModal(false)} className="px-4 py-2 text-gray-400 hover:text-white text-sm font-medium">Cancel</button>
              <button onClick={handleAssign} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Save</button>
            </div>
          </div>
        </div>
      )}

      {viewEvent && <EventDetailsModal event={viewEvent} onClose={() => setViewEvent(null)} />}
      {viewAlert && <AlertDetailsModal alert={viewAlert} onClose={() => setViewAlert(null)} />}
      {viewRawLog && <RawLogDetailsModal log={viewRawLog} onClose={() => setViewRawLog(null)} />}
    </div>
  )
}
