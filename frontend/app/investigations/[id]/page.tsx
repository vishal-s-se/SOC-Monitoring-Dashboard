"use client"

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { DataTable } from '@/components/ui/DataTable'
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

  // Modals
  const [viewEvent, setViewEvent] = useState<any>(null)
  const [viewAlert, setViewAlert] = useState<any>(null)
  const [viewRawLog, setViewRawLog] = useState<any>(null)

  // Related events
  const [relatedEvents, setRelatedEvents] = useState<any[]>([])
  const [loadingRelated, setLoadingRelated] = useState(false)
  const [relatedContextStr, setRelatedContextStr] = useState("")

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

  const handleStatusChange = async (newStatus: string) => {
    try {
      setUpdatingStatus(true)
      await api.post(`/investigations/${id}/status`, {
        status: newStatus
      })
      setStatus(newStatus)
      loadData()
    } catch (err: any) {
      alert("Failed to update status: " + err.message)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const removeEvidence = async (evidenceId: number) => {
    if (!confirm("Are you sure you want to remove this evidence?")) return
    try {
      await api.delete(`/investigations/${id}/evidence/${evidenceId}`)
      loadData()
    } catch (err: any) {
      alert("Failed to remove evidence: " + err.message)
    }
  }

  const loadRelatedEvents = async (type: string, data: any) => {
    try {
      setLoadingRelated(true)
      setRelatedEvents([])
      const query: any = { page: 1, page_size: 50 }
      let contextDesc = ""

      const windowMs = 15 * 60 * 1000 // 15 mins

      if (type === 'HOST' || type === 'AGENT') {
        if (data.hostname) query.hostname = data.hostname
        if (data.id && type === 'AGENT') query.agent_id = data.id
        contextDesc = `Host/Agent: ${data.hostname || data.id} (Last 50 events)`
      } else if (type === 'EVENT' || type === 'RAW_LOG' || type === 'ALERT') {
        const ts = new Date(data.timestamp).getTime()
        query.start_time = new Date(ts - windowMs).toISOString()
        query.end_time = new Date(ts + windowMs).toISOString()

        if (data.hostname) query.hostname = data.hostname
        else if (data.source_ip) query.source_ip = data.source_ip

        contextDesc = `±15 mins around ${new Date(data.timestamp).toLocaleTimeString()}`
        if (data.hostname) contextDesc += ` for ${data.hostname}`
      }

      setRelatedContextStr(contextDesc)
      const res = await api.get<any>('/events', query)
      setRelatedEvents(res.items || [])
    } catch (err: any) {
      alert("Failed to load related events: " + err.message)
    } finally {
      setLoadingRelated(false)
    }
  }

  // Evidence counts from context
  const evidenceCounts = context
    ? `${context.alerts.length} Alerts | ${context.events.length} Events | ${context.raw_logs.length} Raw Logs | ${context.hosts.length} Hosts | ${context.agents.length} Agents`
    : `${inv?.evidence?.length || 0} Total Items`

  if (loading && !inv) return <LoadingState message="Loading Investigation details..." />
  if (error) return <ErrorState message={error} retry={loadData} />
  if (!inv) return <EmptyState title="Not Found" description="Investigation not found." />

  return (
    <div className="space-y-6 pb-20">
      {/* Breadcrumb + Header */}
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
            onChange={e => handleStatusChange(e.target.value)}
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

        {/* Left Column: Summary and Evidence */}
        <div className="lg:col-span-2 space-y-6">

          {/* Summary Card */}
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
                  <label className="text-xs text-gray-500 uppercase font-semibold">Assigned To</label>
                  <p className="text-sm text-gray-300 mt-1">{inv.assigned_to || 'Unassigned'}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 uppercase font-semibold">Evidence Counts</label>
                  <p className="text-sm text-gray-300 mt-1">{evidenceCounts}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Grouped Evidence Card */}
          <Card>
            <CardHeader title="Grouped Evidence" />
            <CardContent className="p-0">
              {!context ? (
                <div className="p-6 text-center text-gray-500">Loading context...</div>
              ) : (
                <div className="divide-y divide-gray-800">

                  {/* Alerts */}
                  {context.alerts.length > 0 && (
                    <div className="p-4">
                      <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
                        Alerts ({context.alerts.length})
                      </h3>
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
                                {item.data.occurrence_count > 1 && ` • x${item.data.occurrence_count}`}
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button onClick={() => loadRelatedEvents('ALERT', { ...item.data, timestamp: item.data.last_seen || item.data.first_seen })} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded">Related Events</button>
                              <button onClick={() => setViewAlert(item.data)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded">View</button>
                              <button onClick={() => removeEvidence(item.evidence_id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Events */}
                  {context.events.length > 0 && (
                    <div className="p-4">
                      <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
                        Events ({context.events.length})
                      </h3>
                      <div className="space-y-2">
                        {context.events.map((item: any) => (
                          <div key={item.evidence_id} className="flex items-center justify-between bg-[#151518] p-3 rounded border border-gray-800/50">
                            <div>
                              <div className="flex items-center space-x-2 mb-1">
                                <SeverityBadge severity={item.data.severity || 'INFO'} />
                                <span className="text-sm font-medium text-white">{item.data.event_type}</span>
                                <span className="text-xs text-gray-400">on {item.data.hostname || 'Unknown'}</span>
                              </div>
                              <div className="text-xs text-gray-500">
                                {new Date(item.data.timestamp).toLocaleString()} • Src: {item.data.source_ip || 'N/A'} → Dst: {item.data.destination_ip || 'N/A'}
                                {item.data.username && ` • User: ${item.data.username}`}
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button onClick={() => loadRelatedEvents('EVENT', item.data)} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded">Related Events</button>
                              <button onClick={() => setViewEvent(item.data)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded">View</button>
                              <button onClick={() => removeEvidence(item.evidence_id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Raw Logs */}
                  {context.raw_logs.length > 0 && (
                    <div className="p-4">
                      <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
                        Raw Logs ({context.raw_logs.length})
                      </h3>
                      <div className="space-y-2">
                        {context.raw_logs.map((item: any) => (
                          <div key={item.evidence_id} className="flex items-center justify-between bg-[#151518] p-3 rounded border border-gray-800/50">
                            <div>
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-sm font-medium text-white">Log ID: {item.data.id}</span>
                                <span className="text-xs bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded">{item.data.source_type}</span>
                              </div>
                              <div className="text-xs text-gray-500">
                                {new Date(item.data.timestamp).toLocaleString()} • Event ID: {item.data.event_identifier || 'N/A'}
                                {item.data.agent_id && ` • Agent: ${item.data.agent_id}`}
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button onClick={() => loadRelatedEvents('RAW_LOG', item.data)} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded">Related Events</button>
                              <button onClick={() => setViewRawLog(item.data)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded">View</button>
                              <button onClick={() => removeEvidence(item.evidence_id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hosts */}
                  {context.hosts.length > 0 && (
                    <div className="p-4">
                      <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
                        Hosts ({context.hosts.length})
                      </h3>
                      <div className="space-y-2">
                        {context.hosts.map((item: any) => (
                          <div key={item.evidence_id} className="flex items-center justify-between bg-[#151518] p-3 rounded border border-gray-800/50">
                            <div>
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-sm font-medium text-white">{item.data.hostname}</span>
                                <span className="text-xs text-gray-400">{item.data.operating_system}</span>
                                <StatusBadge status={item.data.status || 'UNKNOWN'} />
                              </div>
                              <div className="text-xs text-gray-500">
                                IP: {item.data.ip_address || 'Unknown'}
                                {item.data.last_seen && ` • Last seen: ${new Date(item.data.last_seen).toLocaleString()}`}
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button onClick={() => loadRelatedEvents('HOST', item.data)} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded">Related Events</button>
                              <Link href="/hosts" className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded flex items-center justify-center">View Hosts</Link>
                              <button onClick={() => removeEvidence(item.evidence_id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Agents */}
                  {context.agents.length > 0 && (
                    <div className="p-4">
                      <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
                        Agents ({context.agents.length})
                      </h3>
                      <div className="space-y-2">
                        {context.agents.map((item: any) => (
                          <div key={item.evidence_id} className="flex items-center justify-between bg-[#151518] p-3 rounded border border-gray-800/50">
                            <div>
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-sm font-medium text-white">Agent: {item.data.agent_id}</span>
                                <span className="text-xs text-gray-400">{item.data.hostname}</span>
                                <StatusBadge status={item.data.status || 'OFFLINE'} />
                              </div>
                              <div className="text-xs text-gray-500">
                                OS: {item.data.operating_system || 'N/A'}
                                {item.data.last_seen && ` • Last seen: ${new Date(item.data.last_seen).toLocaleString()}`}
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button onClick={() => loadRelatedEvents('AGENT', item.data)} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded">Related Events</button>
                              <Link href="/agents" className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded flex items-center justify-center">View Agents</Link>
                              <button onClick={() => removeEvidence(item.evidence_id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {context.alerts.length === 0 && context.events.length === 0 && context.raw_logs.length === 0 && context.hosts.length === 0 && context.agents.length === 0 && (
                    <div className="p-6 text-center text-gray-500">No evidence added to this investigation.</div>
                  )}

                </div>
              )}
            </CardContent>
          </Card>

          {/* Related Events Section */}
          <Card>
            <CardHeader title="Related Events" />
            <CardContent className="p-0">
              {!relatedContextStr ? (
                <div className="p-6 text-center text-gray-500">
                  Click &quot;Related Events&quot; on any evidence item above to view context.
                </div>
              ) : loadingRelated ? (
                <div className="p-6 text-center text-gray-500">Loading related events...</div>
              ) : relatedEvents.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No related events found for: {relatedContextStr}
                </div>
              ) : (
                <div>
                  <div className="p-3 bg-blue-900/20 border-b border-blue-800/30 text-xs text-blue-400 font-medium">
                    Related events within: {relatedContextStr}
                  </div>
                  <DataTable
                    data={relatedEvents.slice(0, 50)}
                    keyExtractor={(r: any) => r.id.toString()}
                    onRowClick={setViewEvent}
                    columns={[
                      { key: 'timestamp', title: 'Time', render: (r: any) => new Date(r.timestamp).toLocaleTimeString() },
                      { key: 'type', title: 'Type', render: (r: any) => r.event_type || '-' },
                      { key: 'host', title: 'Host', render: (r: any) => r.hostname || '-' },
                      { key: 'user', title: 'User', render: (r: any) => r.username || '-' },
                      { key: 'ip', title: 'Src IP', render: (r: any) => r.source_ip || '-' },
                      { key: 'severity', title: 'Sev', render: (r: any) => <SeverityBadge severity={r.severity || 'INFO'} /> }
                    ]}
                  />
                  {relatedEvents.length >= 50 && (
                    <div className="p-3 text-center text-xs text-gray-500 bg-[#1e1e24] border-t border-gray-800">
                      Additional related events available. Refine search in main events view.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Notes */}
        <div className="space-y-6">
          <Card className="h-[600px] flex flex-col">
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
        </div>

      </div>

      {/* Modals */}
      {viewEvent && <EventDetailsModal event={viewEvent} onClose={() => setViewEvent(null)} />}
      {viewAlert && <AlertDetailsModal alert={viewAlert} onClose={() => setViewAlert(null)} />}
      {viewRawLog && <RawLogDetailsModal log={viewRawLog} onClose={() => setViewRawLog(null)} />}
    </div>
  )
}
