"use client"

import React, { useState, useEffect } from "react"
import { api } from "@/lib/api"

interface TechniqueItem {
  id: number
  technique_id: string
  name: string
  tactics: { tactic_id: string; name: string }[]
}

interface Props {
  investigationId: number | string
  onClose: () => void
  onSuccess: () => void
}

export function AddMitreMappingModal({ investigationId, onClose, onSuccess }: Props) {
  const [search, setSearch] = useState("")
  const [techniques, setTechniques] = useState<any[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [selectedTech, setSelectedTech] = useState<any | null>(null)
  const [confidence, setConfidence] = useState<string>("MEDIUM")
  const [evidenceReference, setEvidenceReference] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        setLoadingSearch(true)
        const params: any = { page: 1, page_size: 20 }
        if (search.trim()) {
          params.search = search.trim()
        }
        const res = await api.get<any>("/mitre/techniques", params)
        setTechniques(res.items || [])
      } catch (err: any) {
        setTechniques([])
      } finally {
        setLoadingSearch(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [search])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTech) {
      setError("Please select a MITRE ATT&CK technique.")
      return
    }

    try {
      setSubmitting(true)
      setError("")
      await api.post("/mitre/mappings", {
        technique_id: selectedTech.technique_id,
        target_type: "INVESTIGATION",
        target_id: String(investigationId),
        mapping_source: "ANALYST_CONFIRMED",
        confidence: confidence,
        evidence_reference: evidenceReference.trim() || undefined,
        notes: notes.trim() || undefined
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to create mapping.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1e1e24] border border-gray-800 rounded-xl w-full max-w-xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#151518]">
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <span className="text-red-400">⚡</span>
              <span>Explicitly Map MITRE Technique</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Link an Enterprise ATT&CK technique to Investigation #{investigationId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg text-sm p-1.5 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 bg-red-950/80 border border-red-800/80 rounded-lg text-xs text-red-200">
              {error}
            </div>
          )}

          {/* Technique Picker */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">
              Select ATT&CK Technique <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              placeholder="Search by ID (e.g. T1059) or name (e.g. PowerShell)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#121215] border border-gray-700 focus:border-red-500 rounded-lg p-2.5 text-white text-sm outline-none transition-colors"
            />

            {/* Selected technique banner */}
            {selectedTech && (
              <div className="mt-2 p-2.5 bg-red-950/40 border border-red-800/60 rounded-lg flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-xs font-bold text-red-300 bg-red-950 border border-red-800 px-2 py-0.5 rounded">
                    {selectedTech.technique_id}
                  </span>
                  <span className="text-sm font-semibold text-white">{selectedTech.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTech(null)}
                  className="text-xs text-gray-400 hover:text-red-300 underline"
                >
                  Change
                </button>
              </div>
            )}

            {/* Technique search dropdown list */}
            {!selectedTech && (
              <div className="mt-2 border border-gray-800 rounded-lg bg-[#121215] max-h-44 overflow-y-auto divide-y divide-gray-800/60">
                {loadingSearch ? (
                  <div className="p-3 text-center text-xs text-gray-500">Searching catalog...</div>
                ) : techniques.length === 0 ? (
                  <div className="p-3 text-center text-xs text-gray-500">No techniques match &quot;{search}&quot;</div>
                ) : (
                  techniques.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTech(t)}
                      className="w-full text-left p-2.5 hover:bg-[#1c1c22] flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-red-300 bg-red-950/60 border border-red-800/40 px-1.5 py-0.5 rounded">
                          {t.technique_id}
                        </span>
                        <span className="text-sm text-gray-200 font-medium">{t.name}</span>
                        {t.is_subtechnique && (
                          <span className="text-[10px] text-gray-400 bg-gray-800 px-1.5 py-0.2 rounded">sub</span>
                        )}
                      </div>
                      <div className="flex items-center space-x-1">
                        {t.tactics && t.tactics.map((tac: any) => (
                          <span key={tac.tactic_id} className="text-[10px] text-blue-300 bg-blue-950/80 px-1 rounded">
                            {tac.name}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Confidence */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">
              Analyst Confidence
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["LOW", "MEDIUM", "HIGH"] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setConfidence(lvl)}
                  className={`py-2 text-xs font-semibold rounded-lg border transition-colors ${
                    confidence === lvl
                      ? lvl === "HIGH"
                        ? "bg-emerald-950/80 border-emerald-600 text-emerald-300"
                        : lvl === "MEDIUM"
                        ? "bg-yellow-950/80 border-yellow-600 text-yellow-300"
                        : "bg-gray-800 border-gray-600 text-gray-200"
                      : "bg-[#121215] border-gray-800 text-gray-400 hover:border-gray-700"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Evidence Reference */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">
              Evidence Reference <span className="text-gray-500 font-normal lowercase">(e.g. Alert #12, Event #449, Host win-server-01)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Alert #42 PowerShell download cradle"
              value={evidenceReference}
              onChange={(e) => setEvidenceReference(e.target.value)}
              className="w-full bg-[#121215] border border-gray-700 focus:border-red-500 rounded-lg p-2 text-white text-sm outline-none transition-colors"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">
              Mapping Justification / Notes <span className="text-gray-500 font-normal lowercase">(optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Analyst reasoning for mapping this technique based on observable artifacts..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#121215] border border-gray-700 focus:border-red-500 rounded-lg p-2 text-white text-sm outline-none resize-none transition-colors"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-gray-800 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedTech}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center space-x-2"
            >
              {submitting ? "Mapping..." : "Confirm Mapping"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
