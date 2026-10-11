"use client";

export function ArchitectureDiagram() {
  return (
    <div className="w-full bg-gray-950 border border-gray-800 rounded-lg p-5 overflow-x-auto shadow-inner">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4 flex items-center justify-between">
        <span>SOC Monitor End-to-End System Architecture</span>
        <span className="text-[10px] text-gray-500 font-mono">PORT BINDINGS & DATAFLOW</span>
      </div>
      <svg
        viewBox="0 0 920 340"
        className="w-full min-w-[760px] h-auto select-none font-sans"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="gradEndpoints" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="gradCollector" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1e3a8a" />
            <stop offset="100%" stopColor="#172554" />
          </linearGradient>
          <linearGradient id="gradBackend" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#047857" />
            <stop offset="100%" stopColor="#064e3b" />
          </linearGradient>
          <linearGradient id="gradDatabase" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6b21a8" />
            <stop offset="100%" stopColor="#4c1d95" />
          </linearGradient>
          <linearGradient id="gradFrontend" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#b45309" />
            <stop offset="100%" stopColor="#78350f" />
          </linearGradient>
          <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 8 5 L 0 9 z" fill="#38bdf8" />
          </marker>
          <marker id="arrowGreen" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 8 5 L 0 9 z" fill="#34d399" />
          </marker>
        </defs>

        {/* Windows Endpoint Box */}
        <g transform="translate(20, 30)">
          <rect width="180" height="110" rx="8" fill="url(#gradEndpoints)" stroke="#38bdf8" strokeWidth="1.5" />
          <rect x="0" y="0" width="180" height="28" rx="8" fill="#0284c7" fillOpacity="0.25" />
          <text x="12" y="19" fill="#38bdf8" fontSize="12" fontWeight="bold">Windows 10/11 Endpoint</text>
          <text x="12" y="48" fill="#94a3b8" fontSize="11">• SOCAgent Windows Service</text>
          <text x="12" y="66" fill="#94a3b8" fontSize="11">• Security/System/Sysmon Logs</text>
          <text x="12" y="84" fill="#94a3b8" fontSize="11">• EventIDs: 4624, 4688, 7045</text>
          <text x="12" y="102" fill="#64748b" fontSize="10" fontFamily="monospace">TCP Ingest → HTTP POST</text>
        </g>

        {/* Linux Endpoint Box */}
        <g transform="translate(20, 180)">
          <rect width="180" height="110" rx="8" fill="url(#gradEndpoints)" stroke="#f59e0b" strokeWidth="1.5" />
          <rect x="0" y="0" width="180" height="28" rx="8" fill="#d97706" fillOpacity="0.25" />
          <text x="12" y="19" fill="#fbbf24" fontSize="12" fontWeight="bold">Linux / Kali Endpoint</text>
          <text x="12" y="48" fill="#94a3b8" fontSize="11">• soc-agent systemd daemon</text>
          <text x="12" y="66" fill="#94a3b8" fontSize="11">• Systemd Journald reader</text>
          <text x="12" y="84" fill="#94a3b8" fontSize="11">• SSH, Sudo, PAM, iptables</text>
          <text x="12" y="102" fill="#64748b" fontSize="10" fontFamily="monospace">PRIORITY 0-7, SYSLOG_ID</text>
        </g>

        {/* Collector Service */}
        <g transform="translate(260, 95)">
          <rect width="190" height="140" rx="8" fill="url(#gradCollector)" stroke="#60a5fa" strokeWidth="2" />
          <rect x="0" y="0" width="190" height="30" rx="8" fill="#2563eb" fillOpacity="0.3" />
          <text x="14" y="20" fill="#93c5fd" fontSize="13" fontWeight="bold">Collector Service</text>
          <text x="14" y="52" fill="#e2e8f0" fontSize="11" fontWeight="semibold">Port 5000 (0.0.0.0:5000)</text>
          <text x="14" y="70" fill="#94a3b8" fontSize="11">• Token Verification</text>
          <text x="14" y="88" fill="#94a3b8" fontSize="11">• Heartbeat Tracker</text>
          <text x="14" y="106" fill="#94a3b8" fontSize="11">• OS Metadata Normalizer</text>
          <text x="14" y="126" fill="#38bdf8" fontSize="10" fontFamily="monospace">Direct DB Persistence</text>
        </g>

        {/* Arrows from Endpoints to Collector */}
        <path d="M 200 85 L 230 85 L 230 145 L 254 145" fill="none" stroke="#38bdf8" strokeWidth="2" markerEnd="url(#arrow)" />
        <path d="M 200 235 L 230 235 L 230 185 L 254 185" fill="none" stroke="#f59e0b" strokeWidth="2" markerEnd="url(#arrow)" />

        {/* Database Box */}
        <g transform="translate(500, 20)">
          <rect width="180" height="120" rx="8" fill="url(#gradDatabase)" stroke="#c084fc" strokeWidth="1.5" />
          <rect x="0" y="0" width="180" height="28" rx="8" fill="#7e22ce" fillOpacity="0.3" />
          <text x="12" y="19" fill="#e9d5ff" fontSize="12" fontWeight="bold">PostgreSQL Database</text>
          <text x="12" y="46" fill="#e2e8f0" fontSize="11" fontWeight="semibold">Port 5432 (soc_monitor)</text>
          <text x="12" y="64" fill="#cbd5e1" fontSize="11">• events, raw_logs, agents</text>
          <text x="12" y="82" fill="#cbd5e1" fontSize="11">• alerts, detection_rules</text>
          <text x="12" y="100" fill="#cbd5e1" fontSize="11">• investigations, hosts</text>
        </g>

        {/* Backend API & Detection Box */}
        <g transform="translate(500, 180)">
          <rect width="180" height="130" rx="8" fill="url(#gradBackend)" stroke="#34d399" strokeWidth="1.5" />
          <rect x="0" y="0" width="180" height="28" rx="8" fill="#059669" fillOpacity="0.3" />
          <text x="12" y="19" fill="#a7f3d0" fontSize="12" fontWeight="bold">FastAPI Backend API</text>
          <text x="12" y="46" fill="#e2e8f0" fontSize="11" fontWeight="semibold">Port 8000 (127.0.0.1)</text>
          <text x="12" y="64" fill="#cbd5e1" fontSize="11">• REST API & Analytics</text>
          <text x="12" y="82" fill="#cbd5e1" fontSize="11">• Detection Engine Seeder</text>
          <text x="12" y="100" fill="#cbd5e1" fontSize="11">• Investigation Intelligence</text>
          <text x="12" y="118" fill="#6ee7b7" fontSize="10" fontFamily="monospace">WebSocket Server /ws</text>
        </g>

        {/* Collector to DB Arrow */}
        <path d="M 450 135 L 475 135 L 475 75 L 494 75" fill="none" stroke="#38bdf8" strokeWidth="2" markerEnd="url(#arrow)" />

        {/* DB to Backend Arrow */}
        <path d="M 590 140 L 590 174" fill="none" stroke="#34d399" strokeWidth="2" strokeDasharray="4 3" markerEnd="url(#arrowGreen)" />

        {/* Frontend Dashboard */}
        <g transform="translate(730, 95)">
          <rect width="170" height="140" rx="8" fill="url(#gradFrontend)" stroke="#fbbf24" strokeWidth="2" />
          <rect x="0" y="0" width="170" height="30" rx="8" fill="#d97706" fillOpacity="0.3" />
          <text x="12" y="20" fill="#fde68a" fontSize="13" fontWeight="bold">Frontend Dashboard</text>
          <text x="12" y="52" fill="#fef3c7" fontSize="11" fontWeight="semibold">Port 3000 (Next.js 14)</text>
          <text x="12" y="72" fill="#cbd5e1" fontSize="11">• OS-Specific Overviews</text>
          <text x="12" y="90" fill="#cbd5e1" fontSize="11">• Forensic Event History</text>
          <text x="12" y="108" fill="#cbd5e1" fontSize="11">• Investigations & MITRE</text>
          <text x="12" y="126" fill="#fde047" fontSize="10" fontFamily="monospace">Live WebSocket Updates</text>
        </g>

        {/* Backend to Frontend Arrows (REST & WS) */}
        <path d="M 680 230 L 705 230 L 705 180 L 724 180" fill="none" stroke="#34d399" strokeWidth="2" markerEnd="url(#arrowGreen)" />
        <path d="M 680 260 L 720 260 L 720 210 L 724 210" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3 3" markerEnd="url(#arrow)" />
      </svg>
      <div className="flex flex-wrap items-center justify-between text-[11px] text-gray-500 mt-2 border-t border-gray-900 pt-2 font-mono">
        <span>Solid lines: Synchronous REST Ingestion & Persistence</span>
        <span>Dashed green: DB Queries / Alert Checks</span>
        <span>Dashed amber: Real-Time WebSocket Streaming</span>
      </div>
    </div>
  );
}

export function EventPipelineDiagram() {
  return (
    <div className="w-full bg-gray-950 border border-gray-800 rounded-lg p-5 overflow-x-auto shadow-inner">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
        Event Collection, Normalization & Detection Pipeline
      </div>
      <svg
        viewBox="0 0 880 180"
        className="w-full min-w-[700px] h-auto select-none font-sans"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <marker id="pipeArrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 8 5 L 0 9 z" fill="#38bdf8" />
          </marker>
        </defs>

        {/* Step 1: Capture */}
        <g transform="translate(10, 30)">
          <rect width="130" height="110" rx="6" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
          <circle cx="22" cy="22" r="10" fill="#0284c7" />
          <text x="19" y="26" fill="#fff" fontSize="10" fontWeight="bold">1</text>
          <text x="38" y="25" fill="#e2e8f0" fontSize="11" fontWeight="bold">Raw Capture</text>
          <text x="12" y="52" fill="#94a3b8" fontSize="10">• WinEventLog / Evt</text>
          <text x="12" y="70" fill="#94a3b8" fontSize="10">• Journald cgroup log</text>
          <text x="12" y="88" fill="#94a3b8" fontSize="10">• Local buffering</text>
          <text x="12" y="104" fill="#64748b" fontSize="9" fontFamily="monospace">No data lost</text>
        </g>

        <line x1="145" y1="85" x2="165" y2="85" stroke="#38bdf8" strokeWidth="2" markerEnd="url(#pipeArrow)" />

        {/* Step 2: Envelope */}
        <g transform="translate(175, 30)">
          <rect width="130" height="110" rx="6" fill="#1e293b" stroke="#60a5fa" strokeWidth="1.5" />
          <circle cx="22" cy="22" r="10" fill="#2563eb" />
          <text x="19" y="26" fill="#fff" fontSize="10" fontWeight="bold">2</text>
          <text x="38" y="25" fill="#e2e8f0" fontSize="11" fontWeight="bold">Envelope</text>
          <text x="12" y="52" fill="#94a3b8" fontSize="10">• agent_id & token</text>
          <text x="12" y="70" fill="#94a3b8" fontSize="10">• os, host, version</text>
          <text x="12" y="88" fill="#94a3b8" fontSize="10">• Timestamp ISO8601</text>
          <text x="12" y="104" fill="#64748b" fontSize="9" fontFamily="monospace">POST /events</text>
        </g>

        <line x1="310" y1="85" x2="330" y2="85" stroke="#38bdf8" strokeWidth="2" markerEnd="url(#pipeArrow)" />

        {/* Step 3: Ingestion & Auth */}
        <g transform="translate(340, 30)">
          <rect width="130" height="110" rx="6" fill="#1e293b" stroke="#818cf8" strokeWidth="1.5" />
          <circle cx="22" cy="22" r="10" fill="#4f46e5" />
          <text x="19" y="26" fill="#fff" fontSize="10" fontWeight="bold">3</text>
          <text x="38" y="25" fill="#e2e8f0" fontSize="11" fontWeight="bold">Validation</text>
          <text x="12" y="52" fill="#94a3b8" fontSize="10">• Verify SHA256 token</text>
          <text x="12" y="70" fill="#94a3b8" fontSize="10">• Update heartbeat</text>
          <text x="12" y="88" fill="#94a3b8" fontSize="10">• Client IP attribution</text>
          <text x="12" y="104" fill="#64748b" fontSize="9" fontFamily="monospace">Collector :5000</text>
        </g>

        <line x1="475" y1="85" x2="495" y2="85" stroke="#38bdf8" strokeWidth="2" markerEnd="url(#pipeArrow)" />

        {/* Step 4: Normalization */}
        <g transform="translate(505, 30)">
          <rect width="135" height="110" rx="6" fill="#1e293b" stroke="#c084fc" strokeWidth="1.5" />
          <circle cx="22" cy="22" r="10" fill="#9333ea" />
          <text x="19" y="26" fill="#fff" fontSize="10" fontWeight="bold">4</text>
          <text x="38" y="25" fill="#e2e8f0" fontSize="11" fontWeight="bold">Normalization</text>
          <text x="12" y="52" fill="#94a3b8" fontSize="10">• category extraction</text>
          <text x="12" y="70" fill="#94a3b8" fontSize="10">• Sev: INFO/MED/HIGH</text>
          <text x="12" y="88" fill="#94a3b8" fontSize="10">• Structured JSON</text>
          <text x="12" y="104" fill="#64748b" fontSize="9" fontFamily="monospace">Write to DB</text>
        </g>

        <line x1="645" y1="85" x2="665" y2="85" stroke="#38bdf8" strokeWidth="2" markerEnd="url(#pipeArrow)" />

        {/* Step 5: Detection & Alerts */}
        <g transform="translate(675, 30)">
          <rect width="145" height="110" rx="6" fill="#1e293b" stroke="#f43f5e" strokeWidth="1.5" />
          <circle cx="22" cy="22" r="10" fill="#e11d48" />
          <text x="19" y="26" fill="#fff" fontSize="10" fontWeight="bold">5</text>
          <text x="38" y="25" fill="#e2e8f0" fontSize="11" fontWeight="bold">Detections & WS</text>
          <text x="12" y="52" fill="#94a3b8" fontSize="10">• Rule matching engine</text>
          <text x="12" y="70" fill="#94a3b8" fontSize="10">• MITRE ATT&CK map</text>
          <text x="12" y="88" fill="#94a3b8" fontSize="10">• Push to /ws</text>
          <text x="12" y="104" fill="#64748b" fontSize="9" fontFamily="monospace">Alert generated</text>
        </g>
      </svg>
    </div>
  );
}

export function InvestigationWorkflowDiagram() {
  return (
    <div className="w-full bg-gray-950 border border-gray-800 rounded-lg p-5 overflow-x-auto shadow-inner">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
        SOC Analyst Investigation & Triage Workflow
      </div>
      <svg
        viewBox="0 0 860 160"
        className="w-full min-w-[700px] h-auto select-none font-sans"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <marker id="invArrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 8 5 L 0 9 z" fill="#10b981" />
          </marker>
        </defs>

        {/* 1: Alert Detection */}
        <g transform="translate(10, 25)">
          <rect width="180" height="100" rx="6" fill="#1e293b" stroke="#f43f5e" strokeWidth="1.5" />
          <text x="14" y="25" fill="#fb7185" fontSize="12" fontWeight="bold">1. Alert Triggered</text>
          <text x="14" y="48" fill="#94a3b8" fontSize="11">• Review in /alerts</text>
          <text x="14" y="66" fill="#94a3b8" fontSize="11">• Status: OPEN</text>
          <text x="14" y="84" fill="#94a3b8" fontSize="11">• Check Severity & Rule</text>
        </g>

        <line x1="195" y1="75" x2="225" y2="75" stroke="#10b981" strokeWidth="2" markerEnd="url(#invArrow)" />

        {/* 2: Context Pivot */}
        <g transform="translate(235, 25)">
          <rect width="180" height="100" rx="6" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
          <text x="14" y="25" fill="#38bdf8" fontSize="12" fontWeight="bold">2. Pivot & Context</text>
          <text x="14" y="48" fill="#94a3b8" fontSize="11">• /host-investigation</text>
          <text x="14" y="66" fill="#94a3b8" fontSize="11">• /ip-investigation</text>
          <text x="14" y="84" fill="#94a3b8" fontSize="11">• Inspect Event Payload</text>
        </g>

        <line x1="420" y1="75" x2="450" y2="75" stroke="#10b981" strokeWidth="2" markerEnd="url(#invArrow)" />

        {/* 3: Investigation Creation */}
        <g transform="translate(460, 25)">
          <rect width="180" height="100" rx="6" fill="#1e293b" stroke="#a855f7" strokeWidth="1.5" />
          <text x="14" y="25" fill="#c084fc" fontSize="12" fontWeight="bold">3. Case File</text>
          <text x="14" y="48" fill="#94a3b8" fontSize="11">• Create in /investigations</text>
          <text x="14" y="66" fill="#94a3b8" fontSize="11">• Add Related Events</text>
          <text x="14" y="84" fill="#94a3b8" fontSize="11">• View /attack-timeline</text>
        </g>

        <line x1="645" y1="75" x2="675" y2="75" stroke="#10b981" strokeWidth="2" markerEnd="url(#invArrow)" />

        {/* 4: Disposition */}
        <g transform="translate(685, 25)">
          <rect width="165" height="100" rx="6" fill="#1e293b" stroke="#10b981" strokeWidth="1.5" />
          <text x="14" y="25" fill="#34d399" fontSize="12" fontWeight="bold">4. Disposition</text>
          <text x="14" y="48" fill="#94a3b8" fontSize="11">• Document Analyst Notes</text>
          <text x="14" y="66" fill="#94a3b8" fontSize="11">• True vs False Positive</text>
          <text x="14" y="84" fill="#94a3b8" fontSize="11">• Close Investigation</text>
        </g>
      </svg>
    </div>
  );
}
