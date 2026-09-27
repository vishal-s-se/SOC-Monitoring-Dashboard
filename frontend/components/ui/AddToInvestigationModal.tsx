import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Props {
  evidenceType: 'ALERT' | 'EVENT' | 'RAW_LOG' | 'HOST' | 'AGENT'
  referenceId: string
  onClose: () => void
  defaultTitle?: string
}

export function AddToInvestigationModal({ evidenceType, referenceId, onClose, defaultTitle }: Props) {
  const [investigations, setInvestigations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [mode, setMode] = useState<'SELECT' | 'CREATE'>('SELECT')

  // Selection
  const [selectedInvId, setSelectedInvId] = useState<number | ''>('')
  const [submitting, setSubmitting] = useState(false)

  // Creation
  const [newTitle, setNewTitle] = useState(defaultTitle || "")
  const [newDesc, setNewDesc] = useState("")
  const [newSeverity, setNewSeverity] = useState("MEDIUM")

  useEffect(() => {
    loadInvestigations()
  }, [])

  const loadInvestigations = async () => {
    try {
      setLoading(true)
      const res = await api.get<any>('/investigations', { page: 1, page_size: 100 })
      // Filter out CLOSED ones for the dropdown
      const active = (res.items || []).filter((i: any) => i.status !== 'CLOSED')
      setInvestigations(active)
      if (active.length > 0) {
        setSelectedInvId(active[0].id)
      } else {
        setMode('CREATE')
      }
    } catch (err: any) {
      setError(err.message || "Failed to load investigations")
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    try {
      setSubmitting(true)
      if (mode === 'SELECT') {
        if (!selectedInvId) return
        await api.post(`/investigations/${selectedInvId}/evidence`, {
          evidence_type: evidenceType,
          reference_id: referenceId.toString()
        })
      } else {
        if (!newTitle.trim()) return
        await api.post('/investigations', {
          title: newTitle,
          description: newDesc,
          severity: newSeverity,
          status: 'OPEN',
          evidence: [
            {
              evidence_type: evidenceType,
              reference_id: referenceId.toString()
            }
          ]
        })
      }
      onClose()
    } catch (err: any) {
      alert("Failed to add evidence: " + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#1e1e24] border border-gray-800 rounded-lg w-full max-w-md flex flex-col shadow-xl">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#1e1e24] rounded-t-lg">
          <h2 className="text-lg font-semibold text-white">Add to Investigation</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="p-4 border-b border-gray-800 flex space-x-2">
          <button
            onClick={() => setMode('SELECT')}
            className={`flex-1 py-1 text-sm font-medium rounded ${mode === 'SELECT' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            Add to Existing
          </button>
          <button
            onClick={() => setMode('CREATE')}
            className={`flex-1 py-1 text-sm font-medium rounded ${mode === 'CREATE' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            Create New
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center text-gray-400 py-4">Loading...</div>
          ) : error ? (
            <div className="text-red-400 text-sm text-center py-4">{error}</div>
          ) : mode === 'SELECT' ? (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Select Investigation</label>
              {investigations.length === 0 ? (
                <div className="text-gray-500 text-sm p-3 bg-[#151518] rounded border border-gray-800">No active investigations available.</div>
              ) : (
                <select
                  className="w-full bg-[#151518] border border-gray-800 rounded-lg p-2.5 text-white text-sm"
                  value={selectedInvId}
                  onChange={(e) => setSelectedInvId(Number(e.target.value))}
                >
                  {investigations.map(i => (
                    <option key={i.id} value={i.id}>INV-{i.id}: {i.title}</option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Title</label>
                <input
                  type="text"
                  className="w-full bg-[#151518] border border-gray-800 rounded-lg p-2 text-white text-sm"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
                <textarea
                  className="w-full bg-[#151518] border border-gray-800 rounded-lg p-2 text-white text-sm h-20"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Severity</label>
                <select
                  className="w-full bg-[#151518] border border-gray-800 rounded-lg p-2 text-white text-sm"
                  value={newSeverity}
                  onChange={e => setNewSeverity(e.target.value)}
                >
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-800 flex justify-end space-x-3 bg-[#1e1e24] rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={submitting || (mode === 'SELECT' && !selectedInvId) || (mode === 'CREATE' && !newTitle.trim())}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Add Evidence'}
          </button>
        </div>
      </div>
    </div>
  )
}
