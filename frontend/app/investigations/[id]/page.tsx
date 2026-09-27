"use client"

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

export default function InvestigationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [inv, setInv] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [newNote, setNewNote] = useState("")
  const [addingNote, setAddingNote] = useState(false)

  const [status, setStatus] = useState("")
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get<any>(`/investigations/${id}`)
      setInv(res)
      setStatus(res.status)
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
        author: "Analyst" // Hardcoded for now
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

  if (loading && !inv) return <LoadingState message="Loading Investigation details..." />
  if (error) return <ErrorState message={error} retry={loadData} />
  if (!inv) return <EmptyState title="Not Found" description="Investigation not found." />

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-white transition-colors">
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-white flex-1">INV-{inv.id}: {inv.title}</h1>
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-gray-800/50">
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
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title={`Evidence (${inv.evidence?.length || 0})`} />
            <CardContent className="p-0">
              {inv.evidence && inv.evidence.length > 0 ? (
                <div className="divide-y divide-gray-800">
                  {inv.evidence.map((ev: any) => (
                    <div key={ev.id} className="p-4 flex items-center justify-between hover:bg-[#1c1c20] transition-colors">
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-bold text-gray-400 bg-gray-800 px-2 py-1 rounded">
                          {ev.evidence_type}
                        </span>
                        <span className="text-gray-300 font-mono text-sm">ID: {ev.reference_id}</span>
                        {ev.description && <span className="text-gray-500 text-sm">- {ev.description}</span>}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(ev.added_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-gray-500">
                  No evidence added to this investigation.
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
    </div>
  )
}
