"use client"

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

// Reusable CodeBlock component with individual Copy button
function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(code)
      } else {
        const textArea = document.createElement("textarea")
        textArea.value = code
        textArea.style.position = "fixed"
        textArea.style.left = "-999999px"
        textArea.style.top = "-999999px"
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand("copy")
        textArea.remove()
      }
      setCopied(true)
      setCopyError(false)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy code:", err)
      setCopyError(true)
      setTimeout(() => setCopyError(false), 2500)
    }
  }

  return (
    <div className="relative group rounded-lg overflow-hidden border border-gray-800 bg-black/90 my-2">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-950/80 border-b border-gray-800/80 text-[11px] text-gray-400">
        <span className="font-mono text-gray-300">{label || 'Command'}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy ${label || 'command'}`}
          className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all duration-150 flex items-center space-x-1 border ${
            copied
              ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
              : copyError
              ? 'bg-red-950 border-red-600 text-red-300'
              : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300 hover:text-white'
          }`}
        >
          {copied ? (
            <>
              <span>✓</span>
              <span>Copied!</span>
            </>
          ) : copyError ? (
            <>
              <span>⚠️</span>
              <span>Failed</span>
            </>
          ) : (
            <>
              <span>📋</span>
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 text-xs text-emerald-400 font-mono overflow-x-auto whitespace-pre leading-relaxed select-all">
        {code}
      </pre>
    </div>
  )
}

// Reusable Copy Full Sequence Button
function CopyAllButton({ fullText, label }: { fullText: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  const handleCopyAll = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullText)
      } else {
        const textArea = document.createElement("textarea")
        textArea.value = fullText
        textArea.style.position = "fixed"
        textArea.style.left = "-999999px"
        textArea.style.top = "-999999px"
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand("copy")
        textArea.remove()
      }
      setCopied(true)
      setCopyError(false)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy sequence:", err)
      setCopyError(true)
      setTimeout(() => setCopyError(false), 2500)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopyAll}
      aria-label={`Copy complete ${label}`}
      className={`w-full py-2 px-3 rounded-lg font-semibold text-xs transition-all duration-200 flex items-center justify-center space-x-2 border shadow-md active:scale-[0.99] ${
        copied
          ? 'bg-emerald-950 border-emerald-500 text-emerald-200'
          : copyError
          ? 'bg-red-950 border-red-500 text-red-200'
          : 'bg-blue-600/90 hover:bg-blue-500 border-blue-400/80 text-white'
      }`}
    >
      <span>{copied ? '✓' : '⚡'}</span>
      <span>{copied ? 'One-Liner Copied to Clipboard!' : `Copy ${label}`}</span>
    </button>
  )
}

export function AddEndpointModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'windows' | 'linux' | 'wsl'>('windows')
  const [code, setCode] = useState("")
  const [copiedToken, setCopiedToken] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [collectorHost, setCollectorHost] = useState("192.168.56.1")
  const [collectorPort, setCollectorPort] = useState("5000")

  // Auto-detect browser location on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname
      // If user accesses via 192.168.x.x or custom domain, default to it
      if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
        setCollectorHost(hostname)
      } else {
        // Default to VirtualBox host-only IP for easy VM connectivity, with localhost available via quick buttons
        setCollectorHost("192.168.56.1")
      }
    }
  }, [])

  // Generate initial token when modal opens
  useEffect(() => {
    if (isOpen && !code) {
      generateToken(activeTab)
    }
  }, [isOpen, activeTab])

  const generateToken = async (targetOs: 'windows' | 'linux' | 'wsl') => {
    setLoading(true)
    setError("")
    try {
      const apiTarget = targetOs === 'wsl' ? 'linux' : targetOs
      const res = await api.post<any>(`/agents/enrollment-code?target_os=${apiTarget}`, {})
      setCode(res.enrollment_code)
    } catch (err: any) {
      setError(err.message || "Failed to generate enrollment code")
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  // Windows Commands
  const winInteractiveOneLiner = `Invoke-WebRequest -Uri "http://${collectorHost}:${collectorPort}/api/v1/agents/download/install-agent.ps1" -OutFile "install-agent.ps1"; .\\install-agent.ps1 -CollectorHost "${collectorHost}" -CollectorPort ${collectorPort}`
  
  const winSilentOneLiner = `Invoke-WebRequest -Uri "http://${collectorHost}:${collectorPort}/api/v1/agents/download/install-agent.ps1" -OutFile "install-agent.ps1"; .\\install-agent.ps1 -CollectorHost "${collectorHost}" -CollectorPort ${collectorPort} -AuthToken "${code || '<PASTE_TOKEN>'}"`

  const winDownloadCmd = `# Download installer script (PowerShell as Administrator)
Invoke-WebRequest -Uri "http://${collectorHost}:${collectorPort}/api/v1/agents/download/install-agent.ps1" -OutFile "install-agent.ps1"`

  const winInstallCmd = `# Run installer with secure hidden token prompt
.\\install-agent.ps1 -CollectorHost "${collectorHost}" -CollectorPort ${collectorPort}`

  const winVerifyCmd = `# Verify Windows Service Status
Get-Service SOCMonitorAgent
Get-Content -Tail 20 "C:\\ProgramData\\SOCMonitorAgent\\agent.log"`

  const winUninstallCmd = `# Run the dedicated uninstaller (preserves identity by default)
& "C:\\ProgramData\\SOCMonitorAgent\\uninstall-agent.ps1"

# Or clean wipe all local state and configuration:
& "C:\\ProgramData\\SOCMonitorAgent\\uninstall-agent.ps1" -FullCleanup`

  // Linux / Kali Commands
  const linuxInteractiveOneLiner = `curl -fsSL "http://${collectorHost}:${collectorPort}/api/v1/agents/download/install-agent.sh" -o install-agent.sh && chmod +x install-agent.sh && sudo ./install-agent.sh --host "${collectorHost}" --port ${collectorPort}`

  const linuxSilentOneLiner = `curl -fsSL "http://${collectorHost}:${collectorPort}/api/v1/agents/download/install-agent.sh" -o install-agent.sh && chmod +x install-agent.sh && sudo ./install-agent.sh --host "${collectorHost}" --port ${collectorPort} --token "${code || '<PASTE_TOKEN>'}"`

  const linuxDownloadCmd = `# 1. Download installer script
curl -fsSL "http://${collectorHost}:${collectorPort}/api/v1/agents/download/install-agent.sh" -o install-agent.sh
chmod +x install-agent.sh`

  const linuxInstallCmd = `# 2. Run installer (prompts securely for token, auto-detects systemd/journald)
sudo ./install-agent.sh --host "${collectorHost}" --port ${collectorPort}`

  const linuxVerifyCmd = `# 3. Verify service and journal ingestion
sudo systemctl status soc-agent.service
sudo journalctl -u soc-agent.service -n 20 --no-pager`

  const linuxUninstallCmd = `# Dedicated uninstaller (preserves host identity)
sudo /opt/soc-monitor-agent/uninstall-agent.sh

# Or clean wipe all local state and keys:
sudo /opt/soc-monitor-agent/uninstall-agent.sh --full`

  // WSL Commands
  const wslInteractiveOneLiner = `curl -fsSL "http://${collectorHost}:${collectorPort}/api/v1/agents/download/install-agent.sh" -o install-agent.sh && chmod +x install-agent.sh && sudo ./install-agent.sh --host "${collectorHost}" --port ${collectorPort}`

  const wslManualStartCmd = `# If systemd is not enabled in WSL, start manually in background:
sudo /opt/soc-monitor-agent/soc-agent --config /etc/soc-monitor-agent/agent.yml &`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden my-auto animate-in fade-in duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950/80 shrink-0">
          <div className="flex items-center space-x-3">
            <span className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-base">🛡️</span>
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight">Enroll New Security Endpoint</h2>
              <p className="text-xs text-gray-400">Stream real-time security events, auth logs, and process telemetry into SOC Monitor</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors"
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        {/* OS Tabs */}
        <div className="flex border-b border-gray-800 bg-gray-950/40 px-6 pt-3 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => { setActiveTab('windows'); generateToken('windows'); }}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-t-lg font-medium text-xs transition-all border-t border-l border-r ${
              activeTab === 'windows'
                ? 'bg-gray-900 border-gray-700 text-blue-400 border-b-transparent shadow-sm'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
            }`}
          >
            <span>🪟</span>
            <span>Windows (10 / 11 / Server)</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('linux'); generateToken('linux'); }}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-t-lg font-medium text-xs transition-all border-t border-l border-r ${
              activeTab === 'linux'
                ? 'bg-gray-900 border-gray-700 text-blue-400 border-b-transparent shadow-sm'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
            }`}
          >
            <span>🐧</span>
            <span>Linux / Kali Linux / Debian</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('wsl'); generateToken('wsl'); }}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-t-lg font-medium text-xs transition-all border-t border-l border-r ${
              activeTab === 'wsl'
                ? 'bg-gray-900 border-gray-700 text-purple-400 border-b-transparent shadow-sm'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
            }`}
          >
            <span>💻</span>
            <span>WSL (Windows Subsystem)</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {error && (
            <div className="p-3 text-xs text-red-400 bg-red-400/10 border border-red-500/20 rounded-lg flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => generateToken(activeTab)} className="underline text-red-300 ml-2">Retry</button>
            </div>
          )}

          {/* Configuration Inputs & Token Banner */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Collector Network Address */}
            <div className="p-3.5 bg-gray-950/70 border border-gray-800 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
                  Collector Address & Port
                </label>
                <div className="flex space-x-1">
                  <button
                    type="button"
                    onClick={() => setCollectorHost('127.0.0.1')}
                    className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                      collectorHost === '127.0.0.1'
                        ? 'bg-blue-900/60 text-blue-300 border-blue-600'
                        : 'bg-gray-850 text-gray-400 border-gray-750 hover:text-gray-200'
                    }`}
                    title="For Windows agent installed on this host"
                  >
                    127.0.0.1 (Local)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollectorHost('192.168.56.1')}
                    className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                      collectorHost === '192.168.56.1'
                        ? 'bg-blue-900/60 text-blue-300 border-blue-600'
                        : 'bg-gray-850 text-gray-400 border-gray-750 hover:text-gray-200'
                    }`}
                    title="For VirtualBox Kali guest VM connecting to Windows host"
                  >
                    192.168.56.1 (VBox)
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={collectorHost}
                  onChange={(e) => setCollectorHost(e.target.value)}
                  placeholder="Collector IP or Hostname"
                  className="flex-1 bg-black border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={collectorPort}
                  onChange={(e) => setCollectorPort(e.target.value)}
                  placeholder="Port"
                  className="w-16 bg-black border border-gray-800 rounded px-2 py-1.5 text-xs text-white font-mono text-center focus:border-blue-500 focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-gray-400 leading-tight">
                💡 VMs (like Kali) must reach your Windows host IP (e.g. Host-Only <code className="text-gray-300">192.168.56.1</code>), not 127.0.0.1.
              </p>
            </div>

            {/* Generated Enrollment Token */}
            <div className="p-3.5 bg-gray-950/70 border border-gray-800 rounded-lg space-y-2 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
                  One-Time Enrollment Token
                </span>
                <span className="text-[10px] bg-yellow-950/80 text-yellow-400 border border-yellow-700/50 px-1.5 py-0.2 rounded font-medium">
                  Expires 24h
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 bg-black border border-gray-800 rounded px-2.5 py-1">
                <span className="font-mono text-xs text-emerald-400 font-bold truncate select-all">
                  {loading ? 'Generating fresh token...' : (code || 'No token active')}
                </span>
                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!code) return
                      try {
                        if (navigator?.clipboard?.writeText) {
                          await navigator.clipboard.writeText(code)
                        }
                        setCopiedToken(true)
                        setTimeout(() => setCopiedToken(false), 2000)
                      } catch {
                        setCopiedToken(false)
                      }
                    }}
                    disabled={!code || loading}
                    className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-[11px] rounded border border-gray-700 transition-colors"
                  >
                    {copiedToken ? '✓ Copied' : '📋 Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => generateToken(activeTab)}
                    disabled={loading}
                    title="Generate new token"
                    className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition-colors text-xs"
                  >
                    🔄
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 leading-tight">
                🔒 Token is single-use and hashed with SHA-256 upon enrollment.
              </p>
            </div>
          </div>

          {/* TAB 1: WINDOWS */}
          {activeTab === 'windows' && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-950/30 border border-blue-600/30 rounded-lg text-xs text-blue-200 space-y-1">
                <div className="font-semibold text-blue-300 flex items-center space-x-1.5">
                  <span>ℹ️</span>
                  <span>Windows 10 / 11 / Server Service Installation</span>
                </div>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  Installs as a resilient native Windows service (<code className="text-white font-mono bg-black/50 px-1 py-0.5 rounded">SOCMonitorAgent</code>) configured for <strong>Automatic startup on boot</strong>. Collects Windows Event Logs (<code className="text-white font-mono">Security</code>, <code className="text-white font-mono">System</code>, <code className="text-white font-mono">Sysmon</code>) and system metrics.
                </p>
              </div>

              {/* Recommended Quick Install */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Option A — Interactive One-Liner (Hidden Token Prompt)
                  </span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-1.5 py-0.2 rounded">
                    Recommended • Secure
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mb-1.5">
                  Paste into Administrator PowerShell. Prompts for your enrollment token secretly without saving credentials in PowerShell command history.
                </p>
                <CopyAllButton fullText={winInteractiveOneLiner} label="Interactive One-Liner" />
                <CodeBlock code={winInteractiveOneLiner} label="PowerShell (Admin) - Interactive" />
              </div>

              {/* Automated Silent Install */}
              <div>
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Option B — Automated Install (Pre-injected Token)
                </span>
                <p className="text-[11px] text-gray-400 mb-1.5">
                  Installs and enrolls in a single step using the current token:
                </p>
                <CodeBlock code={winSilentOneLiner} label="PowerShell (Admin) - Silent" />
              </div>

              {/* Verification & Status */}
              <div>
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Step 2 — Verify Service Status
                </span>
                <CodeBlock code={winVerifyCmd} label="PowerShell - Verify Service" />
              </div>

              {/* Dedicated Uninstall */}
              <div className="pt-2 border-t border-gray-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Uninstallation & Maintenance
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">uninstall-agent.ps1</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  The uninstaller is packaged directly with the agent. It stops the service and cleans up. By default, host identity is preserved; use <code className="text-gray-300 font-mono">-FullCleanup</code> for a complete wipe.
                </p>
                <CodeBlock code={winUninstallCmd} label="PowerShell - Uninstaller" />
              </div>
            </div>
          )}

          {/* TAB 2: LINUX / KALI */}
          {activeTab === 'linux' && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-950/30 border border-blue-600/30 rounded-lg text-xs text-blue-200 space-y-1">
                <div className="font-semibold text-blue-300 flex items-center space-x-1.5">
                  <span>ℹ️</span>
                  <span>Native Linux / Kali Linux / Debian Systemd Service</span>
                </div>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  Installs Debian package (<code className="text-white font-mono bg-black/50 px-1 py-0.5 rounded">soc-monitor-agent.deb</code>) and registers <code className="text-white font-mono bg-black/50 px-1 py-0.5 rounded">soc-agent.service</code> with <strong>systemd boot persistence</strong>. Auto-detects <strong>systemd-journald</strong> for Kali 2023+ and streams all kernel, authentication, and system events.
                </p>
              </div>

              {/* Option A: Interactive One-Liner */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Option A — Interactive One-Liner (Hidden Token Prompt)
                  </span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-1.5 py-0.2 rounded">
                    Recommended • Secure
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mb-1.5">
                  Run in your Kali terminal. Prompts secretly for the token without logging to bash history, verifies packages, and starts the systemd service.
                </p>
                <CopyAllButton fullText={linuxInteractiveOneLiner} label="Interactive Linux One-Liner" />
                <CodeBlock code={linuxInteractiveOneLiner} label="Kali / Linux Bash - Interactive" />
              </div>

              {/* Option B: Silent Install */}
              <div>
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Option B — Automated Silent Install
                </span>
                <p className="text-[11px] text-gray-400 mb-1.5">
                  Downloads and enrolls immediately with the generated token:
                </p>
                <CodeBlock code={linuxSilentOneLiner} label="Kali / Linux Bash - Silent" />
              </div>

              {/* Verification */}
              <div>
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Step 2 — Verify Live Event Pipeline
                </span>
                <CodeBlock code={linuxVerifyCmd} label="Bash - Verify Service Status" />
              </div>

              {/* Dedicated Uninstaller */}
              <div className="pt-2 border-t border-gray-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Uninstallation & Maintenance
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">uninstall-agent.sh</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  The uninstaller is deployed to <code className="text-gray-300 font-mono">/opt/soc-monitor-agent/uninstall-agent.sh</code>. Stops and disables systemd service, removing packages cleanly.
                </p>
                <CodeBlock code={linuxUninstallCmd} label="Bash - Uninstaller" />
              </div>
            </div>
          )}

          {/* TAB 3: WSL */}
          {activeTab === 'wsl' && (
            <div className="space-y-4">
              <div className="p-3 bg-purple-950/30 border border-purple-600/30 rounded-lg text-xs text-purple-200 space-y-1">
                <div className="font-semibold text-purple-300 flex items-center space-x-1.5">
                  <span>ℹ️</span>
                  <span>Windows Subsystem for Linux (WSL)</span>
                </div>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  Monitors logs inside your WSL Linux instance. Note: To monitor the Windows host itself, use the <strong>Windows tab</strong> instead.
                </p>
              </div>

              <div>
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Step 1 — Install inside WSL Terminal
                </span>
                <p className="text-[11px] text-gray-400 mb-1.5">
                  Execute the installer in your WSL terminal:
                </p>
                <CopyAllButton fullText={wslInteractiveOneLiner} label="WSL One-Liner" />
                <CodeBlock code={wslInteractiveOneLiner} label="WSL Bash - Installer" />
              </div>

              <div>
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Step 2 — Service Execution Note
                </span>
                <p className="text-[11px] text-gray-400 mb-1.5">
                  If systemd is enabled in WSL (<code className="text-gray-300">/etc/wsl.conf</code> [boot] systemd=true), it runs as a service automatically. Otherwise, run manually:
                </p>
                <CodeBlock code={wslManualStartCmd} label="WSL Bash - Background Process" />
              </div>

              <div className="pt-2 border-t border-gray-800/80">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Uninstallation in WSL
                </span>
                <CodeBlock code="sudo /opt/soc-monitor-agent/uninstall-agent.sh" label="WSL Bash - Uninstaller" />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-gray-800 bg-gray-950/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Collector listening on port 5000</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white font-medium text-xs rounded-lg border border-gray-700 transition-colors shadow-sm"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  )
}
