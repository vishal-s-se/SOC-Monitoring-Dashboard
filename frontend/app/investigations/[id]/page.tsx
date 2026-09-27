"use client"

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { DataTable } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useWebSocket } from '@/hooks/useWebSocket'

import { EventDetailsModal } from '@/components/ui/EventDetailsModal'
import { AlertDetailsModal } from '@/components/ui/AlertDetailsModal'
import { RawLogDetailsModal } from '@/components/ui/RawLogDetailsModal'

const NOTE_MAX_LENGTH = 2000

export default function InvestigationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [inv, setInv] = useState<any>(null)
  const [context, setContext] = useState<any>(null)
  const [evidenceSummary, setEvidenceSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [newNote, setNewNote] = useState("")
  const [addingNote, setAddingNote] = useState(false)

  const [status, setStatus] = useState("")
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const [showResModal, setShowResModal] = useState(false)
  const [pendingStatus, setPendingStatus] = useState("")
  const [resolutionText, setResolutionText] = useState("")

  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignee, setAssignee] = useState("")

  const [viewEvent, setViewEvent] = useState<any>(null)
  const [viewAlert, setViewAlert] = useState<any>(null)
  const [viewRawLog, setViewRawLog] = useState<any>(null)

  const [relatedEvents, setRelatedEvents] = useState<any[]>([])
  const [loadingRelated, setLoadingRelated] = useState(false)
  const [relatedContextStr, setRelatedContextStr] = useState("")
  const [currentEvidenceId, setCurrentEvidenceId] = useState<number | null>(null)

  const [timeWindow, setTimeWindow] = useState<number>(15)
  const [correlationKeys, setCorrelationKeys] = useState<string>("")
  const [relatedPage, setRelatedPage] = useState(1)
  const [relatedPageSize] = useState(15)
  const [relatedTotal, setRelatedTotal] = useState(0)

  const { lastMessage } = useWebSocket()

  const fetchCorrelatedEvents = useCallback(async (evidenceId: number, tWindow: number, keys: string, p: number) => {
    try {
      setLoadingRelated(true)
      const query: any = {
        evidence_id: evidenceId,
        time_window_minutes: tWindow,
        page: p,
        page_size: relatedPageSize
      }
      if (keys) query.correlation_keys = keys

      const res = await api.get<any>(`/investigations/${id}/correlated-events`, query)
      setRelatedEvents(res.items || [])
      setRelatedTotal(res.total || 0)
    } catch {
      setRelatedEvents([])
      setRelatedTotal(0)
    } finally {
      setLoadingRelated(false)
    }
  }, [id, relatedPageSize])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [res, ctx, summ] = await Promise.all([
        api.get<any>(`/investigations/${id}`),
        api.get<any>(`/investigations/${id}/context`),
        api.get<any>(`/investigations/${id}/summary`)
      ])
      setInv(res)
      setStatus(res.status)
      setContext(ctx)
      setEvidenceSummary(summ)
      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to load investigation")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!lastMessage) return
    const relevantTypes = [
      'investigation_updated', 'investigation_status_changed',
      'investigation_evidence_added', 'investigation_evidence_removed',
      'investigation_note_added', 'investigation_created'
    ]
    if (relevantTypes.includes(lastMessage.type)) {
      if (!lastMessage.data?.id || String(lastMessage.data.id) === id) {
        loadData()
      }
    }
  }, [lastMessage, id, loadData])

  useEffect(() => {
    if (currentEvidenceId !== null) {
      fetchCorrelatedEvents(currentEvidenceId, timeWindow, correlationKeys, relatedPage)
    }
  }, [currentEvidenceId, timeWindow, correlationKeys, relatedPage, fetchCorrelatedEvents])

  const handleAddNote = async () => {
    const trimmed = newNote.trim()
    if (!trimmed) return
    if (trimmed.length > NOTE_MAX_LENGTH) return
    try {
      setAddingNote(true)
      await api.post(`/investigations/${id}/notes`, {
        content: trimmed,
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
        assigned_to: assignee.trim() || null
      })
      setShowAssignModal(false)
      loadData()
    } catch (err: any) {
      alert("Failed to assign: " + err.message)
    }
  }

  const removeEvidence = async (evidenceId: number) => {
    if (!confirm("Remove this evidence from the investigation?\n\nThe underlying record will not be deleted.")) return
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
    let desc = "Source context: "
    if (data.hostname) desc += data.hostname
    else if (data.agent_id) desc += `Agent ${data.agent_id}`
    else if (data.source_ip) desc += `IP ${data.source_ip}`
    else desc += `Item ID ${data.id}`
    setRelatedContextStr(desc)
  }

  if (loading && !inv) return <LoadingState message="Loading investigation..." />
  if (error) return <ErrorState message={error} retry={loadData} />
  if (!inv) return <EmptyState title="Not Found" description="Investigation not found." />

  const noteCharsLeft = NOTE_MAX_LENGTH - newNote.length

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center space-x-4 mb-2">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-white transition-colors text-sm">
          ← Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500 mb-1">
            <Link href="/investigations" className="hover:text-blue-400">Investigations</Link>
            <span className="mx-2">→</span>
            <span>INV-{inv.id}</span>
          </div>
          <h1 className="text-2xl font-bold text-white truncate">{inv.title}</h1>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
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

      {evidenceSummary && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Alerts', value: evidenceSummary.alerts, color: 'text-red-400' },
            { label: 'Events', value: evidenceSummary.events, color: 'text-blue-400' },
            { label: 'Raw Logs', value: evidenceSummary.raw_logs, color: 'text-yellow-400' },
            { label: 'Hosts', value: evidenceSummary.hosts, color: 'text-green-400' },
            { label: 'Agents', value: evidenceSummary.agents, color: 'text-purple-400' },
            { label: 'Notes', value: evidenceSummary.notes, color: 'text-gray-300' },
            { label: 'Total Evidence', value: evidenceSummary.total_evidence, color: 'text-white' },
          ].map(item => (
            <div key={item.label} className="bg-[#1e1e24] border border-gray-800 rounded-lg p-3 text-center">
              <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
              <div className="text-xs text-gray-500 mt-1">{item.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader title="Investigation Summary" />
            <CardContent>
              {inv.description ? (
                <p className="text-gray-300 whitespace-pre-wrap text-sm">{inv.description}</p>
              ) : (
                <p className="text-gray-500 italic text-sm">No description provided.</p>
              )}
              {inv.resolution && (
                <div className="mt-4 p-3 bg-green-900/20 border border-green-800/50 rounded-lg">
                  <h4 className="text-xs font-semibold text-green-400 uppercase mb-1">Resolution</h4>
                  <p className="text-sm text-gray-300">{inv.resolution}</p>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5 pt-4 border-t border-gray-800/50">
                <div>
                  <div className="text-xs text-gray-500 uppercase font-semibold">Created</div>
                  <div className="text-sm text-gray-300 mt-1">{new Date(inv.created_at).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase font-semibold">Last Updated</div>
                  <div className="text-sm text-gray-300 mt-1">{new Date(inv.updated_at).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase font-semibold flex justify-between items-center">
                    Assigned To
                    <button onClick={() => { setAssignee(inv.assigned_to || ""); setShowAssignModal(true) }} className="text-[10px] text-blue-400 hover:text-blue-300 ml-1">Edit</button>
                  </div>
                  <div className="text-sm text-gray-300 mt-1">{inv.assigned_to || <span className="text-gray-500 italic">Unassigned</span>}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {context && context.alerts.length > 0 && (
            <Card>
              <CardHeader title={`Alerts (${context.alerts.length})`} />
              <CardContent className="p-0">
                <div className="divide-y divide-gray-800/50">
                  {context.alerts.map((item: any) => (
                    <div key={item.evidence_id} className="p-4 hover:bg-[#151518] transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <SeverityBadge severity={item.data.severity} />
                            <span className="text-sm font-medium text-white truncate">{item.data.title}</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                            <span>ID: {item.data.id}</span>
                            <span>Status: <span className="text-gray-300">{item.data.status}</span></span>
                            {item.data.occurrence_count != null && (
                              <span>Occurrences: <span className="text-gray-300">{item.data.occurrence_count}</span></span>
                            )}
                            {item.data.rule_id && (
                              <span>Rule: <span className="text-gray-300">{item.data.rule_id}</span></span>
                            )}
                            {item.data.last_seen && (
                              <span>Last seen: <span className="text-gray-300">{new Date(item.data.last_seen).toLocaleString()}</span></span>
                            )}
                            {item.data.agent_id && (
                              <span>Agent: <span className="text-gray-300">{item.data.agent_id}</span></span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => handleLoadRelated(item.evidence_id, item.data)} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded">Correlate</button>
                          <button onClick={() => setViewAlert(item.data)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded">View</button>
                          <button onClick={() => removeEvidence(item.evidence_id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {context && context.events.length > 0 && (
            <Card>
              <CardHeader title={`Events (${context.events.length})`} />
              <CardContent className="p-0">
                <div className="divide-y divide-gray-800/50">
                  {context.events.map((item: any) => (
                    <div key={item.evidence_id} className="p-4 hover:bg-[#151518] transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <SeverityBadge severity={item.data.severity || 'INFO'} />
                            <span className="text-sm font-medium text-white">{item.data.event_type}</span>
                            {item.data.event_category && (
                              <span className="text-xs text-gray-500">({item.data.event_category})</span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                            <span>{new Date(item.data.timestamp).toLocaleString()}</span>
                            {item.data.hostname && <span>Host: <span className="text-gray-300">{item.data.hostname}</span></span>}
                            {item.data.source_ip && <span>Src IP: <span className="text-gray-300">{item.data.source_ip}</span></span>}
                            {item.data.destination_ip && <span>Dst IP: <span className="text-gray-300">{item.data.destination_ip}</span></span>}
                            {item.data.username && <span>User: <span className="text-gray-300">{item.data.username}</span></span>}
                            {item.data.protocol && <span>Protocol: <span className="text-gray-300">{item.data.protocol}</span></span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => handleLoadRelated(item.evidence_id, item.data)} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded">Correlate</button>
                          <button onClick={() => setViewEvent(item.data)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded">View</button>
                          <button onClick={() => removeEvidence(item.evidence_id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {context && context.raw_logs.length > 0 && (
            <Card>
              <CardHeader title={`Raw Log Evidence (${context.raw_logs.length})`} />
              <CardContent className="p-0">
                <div className="divide-y divide-gray-800/50">
                  {context.raw_logs.map((item: any) => {
                    const payload = item.data.raw_payload
                    const preview = typeof payload === 'string'
                      ? payload.slice(0, 200) + (payload.length > 200 ? '…' : '')
                      : ''
                    return (
                      <div key={item.evidence_id} className="p-4 hover:bg-[#151518] transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-white">Log #{item.data.id}</span>
                              <span className="text-xs bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded">{item.data.source_type}</span>
                              {item.data.ingestion_status && (
                                <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">{item.data.ingestion_status}</span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                              <span>{new Date(item.data.timestamp).toLocaleString()}</span>
                              {item.data.source_name && <span>Source: <span className="text-gray-300">{item.data.source_name}</span></span>}
                              {item.data.agent_id && <span>Agent: <span className="text-gray-300">{item.data.agent_id}</span></span>}
                            </div>
                            {preview && (
                              <div className="mt-2 p-2 bg-gray-900 rounded text-xs font-mono text-gray-400 break-all whitespace-pre-wrap select-text">
                                {preview}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => handleLoadRelated(item.evidence_id, item.data)} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded">Correlate</button>
                            <button onClick={() => setViewRawLog(item.data)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded">View</button>
                            <button onClick={() => removeEvidence(item.evidence_id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {context && context.hosts.length > 0 && (
            <Card>
              <CardHeader title={`Hosts (${context.hosts.length})`} />
              <CardContent className="p-0">
                <div className="divide-y divide-gray-800/50">
                  {context.hosts.map((item: any) => (
                    <div key={item.evidence_id} className="p-4 hover:bg-[#151518] transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-white">{item.data.hostname}</span>
                            <StatusBadge status={item.data.status || 'UNKNOWN'} />
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                            {item.data.ip_address && <span>IP: <span className="text-gray-300">{item.data.ip_address}</span></span>}
                            {item.data.operating_system && <span>OS: <span className="text-gray-300">{item.data.operating_system}</span></span>}
                            {item.data.os_version && <span>Version: <span className="text-gray-300">{item.data.os_version}</span></span>}
                            {item.data.last_seen && <span>Last seen: <span className="text-gray-300">{new Date(item.data.last_seen).toLocaleString()}</span></span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => handleLoadRelated(item.evidence_id, item.data)} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded">Correlate</button>
                          <Link href="/hosts" className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded">View</Link>
                          <button onClick={() => removeEvidence(item.evidence_id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {context && context.agents.length > 0 && (
            <Card>
              <CardHeader title={`Agents (${context.agents.length})`} />
              <CardContent className="p-0">
                <div className="divide-y divide-gray-800/50">
                  {context.agents.map((item: any) => (
                    <div key={item.evidence_id} className="p-4 hover:bg-[#151518] transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-white">{item.data.agent_id}</span>
                            <StatusBadge status={item.data.status || 'OFFLINE'} />
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                            {item.data.hostname && <span>Host: <span className="text-gray-300">{item.data.hostname}</span></span>}
                            {item.data.operating_system && <span>OS: <span className="text-gray-300">{item.data.operating_system}</span></span>}
                            {item.data.agent_version && <span>Version: <span className="text-gray-300">{item.data.agent_version}</span></span>}
                            {item.data.ip_address && <span>IP: <span className="text-gray-300">{item.data.ip_address}</span></span>}
                            {item.data.last_heartbeat && <span>Last heartbeat: <span className="text-gray-300">{new Date(item.data.last_heartbeat).toLocaleString()}</span></span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => handleLoadRelated(item.evidence_id, item.data)} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded">Correlate</button>
                          <Link href="/agents" className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded">View</Link>
                          <button onClick={() => removeEvidence(item.evidence_id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {context && context.alerts.length === 0 && context.events.length === 0 && context.raw_logs.length === 0 && context.hosts.length === 0 && context.agents.length === 0 && (
            <Card>
              <CardContent>
                <div className="text-center text-gray-500 py-8">No evidence added to this investigation.</div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader title="Correlated Events" />
            <CardContent className="p-0">
              {!currentEvidenceId ? (
                <div className="p-6 text-center text-gray-500 text-sm">
                  Click <span className="text-gray-300">Correlate</span> on any evidence item above to find related events.
                </div>
              ) : (
                <div>
                  <div className="p-4 bg-[#151518] border-b border-gray-800 flex flex-wrap gap-4 items-end">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Time Window</label>
                      <select
                        value={timeWindow}
                        onChange={e => { setTimeWindow(Number(e.target.value)); setRelatedPage(1) }}
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
                        onChange={e => { setCorrelationKeys(e.target.value); setRelatedPage(1) }}
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
                    <div className="flex-1 text-right">
                      <div className="text-xs text-gray-500">{relatedContextStr}</div>
                    </div>
                  </div>

                  {loadingRelated ? (
                    <div className="p-6 text-center text-gray-500 text-sm">Loading correlated events...</div>
                  ) : relatedEvents.length === 0 ? (
                    <div className="p-6 text-center text-gray-500 text-sm">No related events found for the selected context.</div>
                  ) : (
                    <div>
                      <DataTable
                        data={relatedEvents}
                        keyExtractor={(r: any) => r.id.toString()}
                        onRowClick={setViewEvent}
                        columns={[
                          { key: 'timestamp', title: 'Time', render: (r: any) => new Date(r.timestamp).toLocaleString() },
                          { key: 'type', title: 'Type', render: (r: any) => r.event_type || '-' },
                          { key: 'host', title: 'Host', render: (r: any) => r.hostname || '-' },
                          { key: 'user', title: 'User', render: (r: any) => r.username || '-' },
                          { key: 'src_ip', title: 'Src IP', render: (r: any) => r.source_ip || '-' },
                          { key: 'dst_ip', title: 'Dst IP', render: (r: any) => r.destination_ip || '-' },
                          { key: 'severity', title: 'Sev', render: (r: any) => <SeverityBadge severity={r.severity || 'INFO'} /> },
                          { key: 'reason', title: 'Correlation Reason', render: (r: any) => <span className="text-green-400 text-xs">{r.correlation_reason || '-'}</span> },
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
          <Card className="flex flex-col h-[480px]">
            <CardHeader title={`Analyst Notes${inv.notes?.length ? ` (${inv.notes.length})` : ''}`} />
            <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {inv.notes && inv.notes.length > 0 ? (
                  [...inv.notes].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((note: any) => (
                    <div key={note.id} className="bg-[#151518] p-3 rounded-lg border border-gray-800/50">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-semibold text-blue-400">{note.author || 'Analyst'}</span>
                        <span className="text-xs text-gray-500">{new Date(note.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{note.content}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-500 text-sm mt-10">No analyst notes yet.</div>
                )}
              </div>
              <div className="p-3 border-t border-gray-800 bg-[#1e1e24] shrink-0">
                <textarea
                  className="w-full bg-[#151518] border border-gray-800 rounded-lg p-2 text-white h-20 text-sm mb-1 resize-none"
                  placeholder="Add a note (max 2000 characters)..."
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  maxLength={NOTE_MAX_LENGTH}
                />
                <div className="flex justify-between items-center mb-2">
                  <span className={`text-xs ${noteCharsLeft < 100 ? 'text-yellow-400' : 'text-gray-600'}`}>
                    {noteCharsLeft} chars remaining
                  </span>
                </div>
                <button
                  onClick={handleAddNote}
                  disabled={addingNote || !newNote.trim() || newNote.length > NOTE_MAX_LENGTH}
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
              <div className="p-4 max-h-[360px] overflow-y-auto">
                {inv.history && inv.history.length > 0 ? (
                  <div className="space-y-2">
                    {inv.history.map((h: any) => (
                      <div key={h.id} className="p-2 bg-[#151518] rounded border border-gray-800 text-xs">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-gray-300">{h.changed_by || 'System'}</span>
                          <span className="text-gray-500">{new Date(h.created_at).toLocaleString()}</span>
                        </div>
                        <div className="text-gray-400">
                          <span className="text-gray-500">{h.previous_status || '—'}</span>
                          <span className="mx-2 text-gray-600">→</span>
                          <span className="text-white font-medium">{h.new_status}</span>
                        </div>
                        {h.reason && <div className="text-gray-500 mt-1 italic truncate">&quot;{h.reason}&quot;</div>}
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
          <div className="bg-[#1e1e24] border border-gray-800 rounded-lg w-full max-w-md shadow-xl">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">
                {pendingStatus === 'RESOLVED' ? 'Resolve' : 'Close'} Investigation
              </h2>
              <button onClick={() => { setShowResModal(false); setStatus(inv.status) }} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-400 mb-2">Resolution Summary <span className="text-gray-600 text-xs">(optional)</span></label>
              <textarea
                className="w-full bg-[#151518] border border-gray-800 rounded-lg p-3 text-white text-sm h-28 resize-none"
                placeholder="e.g. Investigation completed after reviewing evidence. No further action required."
                value={resolutionText}
                onChange={e => setResolutionText(e.target.value)}
              />
            </div>
            <div className="p-4 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => { setShowResModal(false); setStatus(inv.status) }} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Cancel</button>
              <button
                onClick={() => updateStatusAPI(pendingStatus, resolutionText || undefined)}
                disabled={updatingStatus}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {updatingStatus ? 'Saving...' : `Save & ${pendingStatus === 'RESOLVED' ? 'Resolve' : 'Close'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAssignModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#1e1e24] border border-gray-800 rounded-lg w-full max-w-sm shadow-xl">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">Assign Analyst</h2>
              <button onClick={() => setShowAssignModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-400 mb-2">Analyst Name</label>
              <input
                type="text"
                className="w-full bg-[#151518] border border-gray-800 rounded-lg p-2 text-white text-sm"
                placeholder="Leave empty to unassign"
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
                autoFocus
              />
            </div>
            <div className="p-4 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowAssignModal(false)} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Cancel</button>
              <button onClick={handleAssign} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">Save</button>
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
