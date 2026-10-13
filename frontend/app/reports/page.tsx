"use client"

import React, { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/ui/States'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'

export default function ReportsPage() {
  const [step, setStep] = useState(1)
  const [hosts, setHosts] = useState<any[]>([])
  const [loadingHosts, setLoadingHosts] = useState(false)
  
  // Wizard Configuration State
  const [title, setTitle] = useState("SOCForge Security Operations Audit Report")
  const [selectedEndpoints, setSelectedEndpoints] = useState<string[]>([])
  const [periodPreset, setPeriodPreset] = useState("24h")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [selectedSections, setSelectedSections] = useState<string[]>([
    "executive_summary",
    "alerts",
    "events",
    "investigations"
  ])
  const [presentationFormat, setPresentationFormat] = useState("graphs_and_text")
  
  // Preview & Generation State
  const [previewData, setPreviewData] = useState<any>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    const fetchHosts = async () => {
      try {
        setLoadingHosts(true)
        const res = await api.get<any>('/hosts/?limit=50')
        setHosts(res.items || [])
      } catch (e) {
        console.warn("Could not load hosts list:", e)
      } finally {
        setLoadingHosts(false)
      }
    }
    fetchHosts()
  }, [])

  const handleToggleEndpoint = (hostname: string) => {
    setSelectedEndpoints(prev => 
      prev.includes(hostname) ? prev.filter(h => h !== hostname) : [...prev, hostname]
    )
  }

  const handleSelectAllEndpoints = () => {
    if (selectedEndpoints.length === hosts.length) {
      setSelectedEndpoints([])
    } else {
      setSelectedEndpoints(hosts.map(h => h.hostname))
    }
  }

  const handleToggleSection = (sectionKey: string) => {
    setSelectedSections(prev =>
      prev.includes(sectionKey) ? prev.filter(s => s !== sectionKey) : [...prev, sectionKey]
    )
  }

  const fetchPreview = async () => {
    try {
      setLoadingPreview(true)
      setErrorMessage("")
      const payload: any = {
        title,
        period_preset: periodPreset,
        endpoints: selectedEndpoints.length > 0 ? selectedEndpoints : null,
        sections: selectedSections,
        presentation_format: presentationFormat
      }
      if (periodPreset === "custom" && customStart && customEnd) {
        payload.start_time = new Date(customStart).toISOString()
        payload.end_time = new Date(customEnd).toISOString()
      }

      const res = await api.post<any>('/reports/wizard/preview', payload)
      setPreviewData(res)
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to load report scope preview")
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleGeneratePdf = async () => {
    try {
      setGeneratingPdf(true)
      setStatusMessage("Synthesizing cryptographic telemetry and rendering PDF...")
      setErrorMessage("")
      
      const payload: any = {
        title,
        period_preset: periodPreset,
        endpoints: selectedEndpoints.length > 0 ? selectedEndpoints : null,
        sections: selectedSections,
        presentation_format: presentationFormat
      }
      if (periodPreset === "custom" && customStart && customEnd) {
        payload.start_time = new Date(customStart).toISOString()
        payload.end_time = new Date(customEnd).toISOString()
      }

      const blob = await api.download('/reports/wizard/generate-pdf', payload)
      
      // Trigger secure browser download
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `SOCForge_Report_${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setStatusMessage("Report successfully generated and downloaded!")
    } catch (err: any) {
      setErrorMessage(err.message || "PDF generation encountered an error")
      setStatusMessage("")
    } finally {
      setGeneratingPdf(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-800 pb-4">
        <div>
          <PageHeader
            title="SOCForge Guided Report Generator"
            description="Produce audit-ready defensive telemetry & incident intelligence reports in PDF format."
          />
        </div>
        <div className="mt-4 sm:mt-0 flex items-center space-x-2 text-xs">
          <span className="px-2 py-1 bg-cyan-950/80 border border-cyan-800/80 text-cyan-400 rounded font-mono">
            ENGINE: PyMuPDF v1.24
          </span>
          <span className="px-2 py-1 bg-blue-950/80 border border-blue-800/80 text-blue-400 rounded font-mono">
            CONFIDENTIAL
          </span>
        </div>
      </div>

      {/* Progress Step Navigation */}
      <div className="grid grid-cols-5 gap-2 bg-gray-900 p-2 rounded-lg border border-gray-800 text-xs">
        {[
          { num: 1, label: "Scope" },
          { num: 2, label: "Period" },
          { num: 3, label: "Sections" },
          { num: 4, label: "Format" },
          { num: 5, label: "Generate" }
        ].map(s => (
          <button
            key={s.num}
            onClick={() => {
              if (s.num === 5) fetchPreview()
              setStep(s.num)
            }}
            className={`flex items-center justify-center space-x-1.5 py-2 px-3 rounded font-medium transition-all ${
              step === s.num
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50'
                : step > s.num
                ? 'bg-gray-800 text-cyan-400'
                : 'text-gray-400 hover:bg-gray-800/60'
            }`}
          >
            <span className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px]">
              {s.num}
            </span>
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        ))}
      </div>

      {errorMessage && (
        <div className="p-4 rounded-md bg-red-950/60 border border-red-800 text-red-200 text-sm flex items-center space-x-2">
          <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* STEP 1: ENDPOINT SELECTION & TITLE */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-100">Step 1: Report Title & Endpoint Scope</h2>
            <p className="text-xs text-gray-400">Select specific hosts or generate an enterprise-wide summary across all endpoints.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Report Heading / Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-md text-sm text-gray-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-gray-300">Target Host Endpoints</label>
                {hosts.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllEndpoints}
                    className="text-xs text-cyan-400 hover:text-cyan-300 underline"
                  >
                    {selectedEndpoints.length === hosts.length ? "Deselect All" : "Select All Available"}
                  </button>
                )}
              </div>

              {loadingHosts ? (
                <div className="text-xs text-gray-400 py-3">Loading registered hosts...</div>
              ) : hosts.length === 0 ? (
                <div className="p-3 bg-gray-950 border border-gray-800 rounded text-xs text-gray-400">
                  No dedicated endpoints discovered. The report will automatically synthesize all telemetry across the main environment.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-gray-950 border border-gray-800 rounded">
                  {hosts.map(h => (
                    <label key={h.id} className="flex items-center space-x-2 text-xs text-gray-300 cursor-pointer p-1.5 rounded hover:bg-gray-850">
                      <input
                        type="checkbox"
                        checked={selectedEndpoints.includes(h.hostname)}
                        onChange={() => handleToggleEndpoint(h.hostname)}
                        className="rounded border-gray-700 text-blue-600 focus:ring-0"
                      />
                      <span className="truncate">{h.hostname}</span>
                      <span className="text-[10px] text-gray-500 font-mono">({h.operating_system || "OS"})</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold"
              >
                Continue to Reporting Period →
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: REPORTING PERIOD */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-100">Step 2: Observation Window & Timestamp Range</h2>
            <p className="text-xs text-gray-400">Choose a predefined observation window or define custom UTC timestamp bounds.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { id: "24h", label: "Last 24 Hours", desc: "Immediate incident response" },
                { id: "7d", label: "Last 7 Days", desc: "Weekly posture overview" },
                { id: "30d", label: "Last 30 Days", desc: "Monthly threat summary" },
                { id: "custom", label: "Custom Window", desc: "Specific audit interval" }
              ].map(p => (
                <div
                  key={p.id}
                  onClick={() => setPeriodPreset(p.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    periodPreset === p.id
                      ? 'bg-blue-950/60 border-cyan-500 shadow-md shadow-cyan-950/40'
                      : 'bg-gray-950 border-gray-800 hover:border-gray-700'
                  }`}
                >
                  <div className="font-semibold text-sm text-gray-200">{p.label}</div>
                  <div className="text-[11px] text-gray-400 mt-1">{p.desc}</div>
                </div>
              ))}
            </div>

            {periodPreset === "custom" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-950 border border-gray-800 rounded-lg">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Start Date & Time (UTC)</label>
                  <input
                    type="datetime-local"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-xs text-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">End Date & Time (UTC)</label>
                  <input
                    type="datetime-local"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-xs text-gray-200"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-between pt-4 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold"
              >
                Continue to Report Sections →
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: REPORT SECTIONS */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-100">Step 3: Intelligence Sections</h2>
            <p className="text-xs text-gray-400">Select which telemetry and analysis domains should be compiled into the PDF.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {[
                { id: "executive_summary", title: "Executive Summary & Posture Metrics", desc: "Top-level counts for events, alerts, host status, and authentication ratios." },
                { id: "alerts", title: "Security Alerts & Detections", desc: "High/Critical alert tables with MITRE tactic references and host targets." },
                { id: "events", title: "Endpoint Telemetry Log Evidence", desc: "Chronological sample of authentication, network, firewall, and process events." },
                { id: "investigations", title: "Incident Investigations & Case Files", desc: "Active investigation status, severity ratings, and evidence summaries." }
              ].map(sec => (
                <label
                  key={sec.id}
                  className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedSections.includes(sec.id)
                      ? 'bg-blue-950/40 border-blue-500/80'
                      : 'bg-gray-950 border-gray-800 hover:border-gray-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSections.includes(sec.id)}
                    onChange={() => handleToggleSection(sec.id)}
                    className="mt-0.5 rounded border-gray-700 text-blue-600 focus:ring-0"
                  />
                  <div>
                    <div className="text-xs font-semibold text-gray-200">{sec.title}</div>
                    <div className="text-[11px] text-gray-400">{sec.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex justify-between pt-4 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold"
              >
                Continue to Presentation Format →
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: PRESENTATION FORMAT */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-100">Step 4: Presentation & Layout Style</h2>
            <p className="text-xs text-gray-400">Specify visual density and evidence breakdown.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: "graphs_and_text", title: "Graphs, Tables & Explanations", desc: "Standard SOC briefing layout with structured tables, metric tiles, and text summaries." },
                { id: "text_only", title: "Text & Evidence Audit Only", desc: "Dense text and tabular evidence output suited for formal compliance archives." },
                { id: "graphs_only", title: "Metric Summary Focused", desc: "Compact operational dashboard layout highlighting key telemetry volumes." }
              ].map(f => (
                <div
                  key={f.id}
                  onClick={() => setPresentationFormat(f.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    presentationFormat === f.id
                      ? 'bg-blue-950/60 border-cyan-500 shadow-md shadow-cyan-950/40'
                      : 'bg-gray-950 border-gray-800 hover:border-gray-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-gray-200">{f.title}</div>
                  <div className="text-[11px] text-gray-400 mt-1">{f.desc}</div>
                </div>
              ))}
            </div>

            <div className="flex justify-between pt-4 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => {
                  fetchPreview()
                  setStep(5)
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold"
              >
                Review Scope Preview & Generate →
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 5: PREVIEW & GENERATE */}
      {step === 5 && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-100">Step 5: Pre-Flight Scope Preview & Compilation</h2>
            <p className="text-xs text-gray-400">Review selected scope and verified database records before rendering the official PDF.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            {loadingPreview ? (
              <div className="text-center py-8 text-sm text-gray-400 animate-pulse">
                Auditing database telemetry within requested scope...
              </div>
            ) : previewData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-gray-950 border border-gray-800 rounded">
                    <div className="text-[10px] text-gray-400 uppercase">Available Events</div>
                    <div className="text-xl font-bold text-cyan-400 mt-1">{previewData.data_availability?.events_count ?? 0}</div>
                  </div>
                  <div className="p-3 bg-gray-950 border border-gray-800 rounded">
                    <div className="text-[10px] text-gray-400 uppercase">Triggered Alerts</div>
                    <div className="text-xl font-bold text-orange-400 mt-1">{previewData.data_availability?.alerts_count ?? 0}</div>
                  </div>
                  <div className="p-3 bg-gray-950 border border-gray-800 rounded">
                    <div className="text-[10px] text-gray-400 uppercase">Active Cases</div>
                    <div className="text-xl font-bold text-yellow-400 mt-1">{previewData.data_availability?.investigations_count ?? 0}</div>
                  </div>
                  <div className="p-3 bg-gray-950 border border-gray-800 rounded">
                    <div className="text-[10px] text-gray-400 uppercase">Online Endpoints</div>
                    <div className="text-xl font-bold text-green-400 mt-1">{previewData.data_availability?.hosts_online ?? 0}</div>
                  </div>
                </div>

                <div className="p-4 bg-gray-950 border border-gray-800 rounded text-xs space-y-2">
                  <div className="flex justify-between border-b border-gray-850 pb-1.5">
                    <span className="text-gray-400">Report Title:</span>
                    <span className="text-gray-200 font-medium">{previewData.title}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-850 pb-1.5">
                    <span className="text-gray-400">Reporting Interval:</span>
                    <span className="text-cyan-300 font-medium">{previewData.time_range_desc}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-850 pb-1.5">
                    <span className="text-gray-400">Endpoint Scope:</span>
                    <span className="text-gray-200 truncate max-w-xs">{previewData.endpoints_selected?.join(", ")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Sections Included:</span>
                    <span className="text-gray-200">{previewData.sections_selected?.length} selected</span>
                  </div>
                </div>
              </div>
            ) : null}

            {statusMessage && (
              <div className="p-3 bg-cyan-950/60 border border-cyan-800 rounded text-cyan-200 text-xs font-mono">
                {statusMessage}
              </div>
            )}

            <div className="flex justify-between pt-4 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs"
              >
                ← Back to Format
              </button>
              <button
                type="button"
                disabled={generatingPdf}
                onClick={handleGeneratePdf}
                className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded text-xs font-bold tracking-wide shadow-lg shadow-cyan-950/60 transition-all disabled:opacity-50"
              >
                {generatingPdf ? (
                  <>
                    <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Generating Official PDF...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Compile & Download PDF Report</span>
                  </>
                )}
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
