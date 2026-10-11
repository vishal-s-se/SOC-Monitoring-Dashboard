"use client"

import { useState } from 'react'
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
        // Fallback for older browsers or restricted iframe environments
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
        <span>{label || 'Command'}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy ${label || 'command'}`}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all duration-150 flex items-center space-x-1 border ${
            copied
              ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
              : copyError
              ? 'bg-red-950 border-red-600 text-red-300'
              : 'bg-gray-850 hover:bg-gray-750 border-gray-700 text-gray-300 hover:text-white'
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
      <pre className="p-3 text-xs text-green-400 font-mono overflow-x-auto whitespace-pre leading-relaxed select-all">
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
      aria-label={`Copy complete ${label} sequence`}
      className={`w-full py-2.5 px-4 rounded-lg font-semibold text-xs transition-all duration-200 flex items-center justify-center space-x-2 border shadow-md active:scale-[0.99] ${
        copied
          ? 'bg-emerald-950 border-emerald-500 text-emerald-200'
          : copyError
          ? 'bg-red-950 border-red-500 text-red-200'
          : 'bg-blue-600/90 hover:bg-blue-500 border-blue-400/80 text-white'
      }`}
    >
      <span>{copied ? '✓' : '⚡'}</span>
      <span>{copied ? 'Full Installation Sequence Copied!' : `Copy Full ${label} Sequence`}</span>
    </button>
  )
}

export function AddEndpointModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [os, setOs] = useState<'windows' | 'linux' | 'wsl' | null>(null)
  const [code, setCode] = useState("")
  const [copiedToken, setCopiedToken] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  if (!isOpen) return null

  const handleNext = async () => {
    if (!os) return
    setLoading(true)
    setError("")
    try {
      // WSL and Linux use the same linux enrollment path under the hood
      const targetOs = os === 'wsl' ? 'linux' : os
      const res = await api.post<any>(`/agents/enrollment-code?target_os=${targetOs}`, {})
      setCode(res.enrollment_code)
      setStep(2)
    } catch (err: any) {
      setError(err.message || "Failed to get enrollment code")
    } finally {
      setLoading(false)
    }
  }

  const handleRefreshToken = async () => {
    if (!os) return
    setLoading(true)
    setError("")
    try {
      const targetOs = os === 'wsl' ? 'linux' : os
      const res = await api.post<any>(`/agents/enrollment-code?target_os=${targetOs}`, {})
      setCode(res.enrollment_code)
    } catch (err: any) {
      setError(err.message || "Failed to refresh enrollment code")
    } finally {
      setLoading(false)
    }
  }

  const serverHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'

  // Windows Commands
  const winDownloadCmd = `# 1. Download installer script and binaries
Invoke-WebRequest -Uri "http://${serverHost}:8000/api/v1/agents/download/script/windows/install" -OutFile "Install-SOCAgent.ps1"
Invoke-WebRequest -Uri "http://${serverHost}:8000/api/v1/agents/download/windows" -OutFile "soc-agent-windows.zip"`

  const winExtractCmd = `# 2. Extract agent
Expand-Archive soc-agent-windows.zip -DestinationPath . -Force`

  const winInstallCmd = `# 3. Install and enroll service (Runs with Administrator privileges)
.\\Install-SOCAgent.ps1 -CollectorHost "${serverHost}" -CollectorPort 5000 -AuthToken "${code}"`

  const winVerifyCmd = `# Verify SOCMonitorAgent Windows service status
Get-Service SOCMonitorAgent`

  const winUninstallCmd = `# To stop and uninstall the Windows service
Invoke-WebRequest -Uri "http://${serverHost}:8000/api/v1/agents/download/script/windows/uninstall" -OutFile "Uninstall-SOCAgent.ps1"
.\\Uninstall-SOCAgent.ps1`

  const winFullSequence = `# === SOC Monitor Windows Agent Installation Sequence ===
# Run in PowerShell as Administrator

# Step 1: Download installer script and binary archive
Invoke-WebRequest -Uri "http://${serverHost}:8000/api/v1/agents/download/script/windows/install" -OutFile "Install-SOCAgent.ps1"
Invoke-WebRequest -Uri "http://${serverHost}:8000/api/v1/agents/download/windows" -OutFile "soc-agent-windows.zip"

# Step 2: Extract agent binaries
Expand-Archive soc-agent-windows.zip -DestinationPath . -Force

# Step 3: Run service installer with single-use enrollment token
.\\Install-SOCAgent.ps1 -CollectorHost "${serverHost}" -CollectorPort 5000 -AuthToken "${code}"

# Step 4: Verify service status
Get-Service SOCMonitorAgent`

  // Linux Commands
  const linuxDownloadCmd = `# 1. Download Debian package
wget http://${serverHost}:8000/api/v1/agents/download/linux -O soc-monitor-agent.deb`

  const linuxInstallPkgCmd = `# 2. Install package
sudo dpkg -i soc-monitor-agent.deb`

  const linuxConfigCmd = `# 3. Configure Collector address and auth token
sudo tee /etc/soc-monitor-agent/agent.yml > /dev/null << 'EOF'
collector:
  host: "${serverHost}"
  port: 5000
  tls: false
  auth_token: "${code}"

agent:
  id_file: "/var/lib/soc-monitor-agent/agent_id.txt"
  state_dir: "/var/lib/soc-monitor-agent/state"
  heartbeat_interval: 60
  buffer_max_events: 1000
  collection_interval: 5
  retry_max_delay: 60
  max_payload_bytes: 1048576

linux:
  log_sources:
    - "/var/log/syslog"
    - "/var/log/auth.log"
EOF`

  const linuxStartServiceCmd = `# 4. Enable and start systemd service
sudo systemctl daemon-reload
sudo systemctl enable soc-monitor-agent
sudo systemctl restart soc-monitor-agent`

  const linuxVerifyCmd = `# Verify service status
sudo systemctl status soc-monitor-agent`

  const linuxUninstallCmd = `# Stop and remove the Linux agent package
sudo systemctl stop soc-monitor-agent
sudo dpkg --purge soc-monitor-agent`

  const linuxFullSequence = `# === SOC Monitor Native Linux (Debian/Ubuntu) Installation Sequence ===
# Run with sudo/root permissions

# Step 1: Download agent package
wget http://${serverHost}:8000/api/v1/agents/download/linux -O soc-monitor-agent.deb

# Step 2: Install Debian package
sudo dpkg -i soc-monitor-agent.deb

# Step 3: Write configuration file with enrollment token
sudo tee /etc/soc-monitor-agent/agent.yml > /dev/null << 'EOF'
collector:
  host: "${serverHost}"
  port: 5000
  tls: false
  auth_token: "${code}"

agent:
  id_file: "/var/lib/soc-monitor-agent/agent_id.txt"
  state_dir: "/var/lib/soc-monitor-agent/state"
  heartbeat_interval: 60
  buffer_max_events: 1000
  collection_interval: 5
  retry_max_delay: 60
  max_payload_bytes: 1048576

linux:
  log_sources:
    - "/var/log/syslog"
    - "/var/log/auth.log"
EOF

# Step 4: Enable and start systemd service
sudo systemctl daemon-reload
sudo systemctl enable soc-monitor-agent
sudo systemctl restart soc-monitor-agent

# Step 5: Check status
sudo systemctl status soc-monitor-agent`

  // WSL Commands
  const wslDownloadCmd = `# 1. Download Debian package inside WSL terminal
wget http://${serverHost}:8000/api/v1/agents/download/linux -O soc-monitor-agent.deb`

  const wslInstallPkgCmd = `# 2. Install package inside WSL
sudo dpkg -i soc-monitor-agent.deb`

  const wslConfigCmd = `# 3. Write configuration with enrollment token
sudo tee /etc/soc-monitor-agent/agent.yml > /dev/null << 'EOF'
collector:
  host: "${serverHost}"
  port: 5000
  tls: false
  auth_token: "${code}"

agent:
  id_file: "/var/lib/soc-monitor-agent/agent_id.txt"
  state_dir: "/var/lib/soc-monitor-agent/state"
  heartbeat_interval: 60
  buffer_max_events: 1000
  collection_interval: 5
  retry_max_delay: 60
  max_payload_bytes: 1048576

linux:
  log_sources:
    - "/var/log/syslog"
    - "/var/log/auth.log"
EOF`

  const wslStartSystemdCmd = `# 4a. If WSL systemd is enabled (/etc/wsl.conf has [boot] systemd=true)
sudo systemctl restart soc-monitor-agent
sudo systemctl status soc-monitor-agent`

  const wslStartManualCmd = `# 4b. If WSL systemd is not enabled, launch manually in background
sudo /usr/bin/soc-monitor-agent --config /etc/soc-monitor-agent/agent.yml &`

  const wslUninstallCmd = `# Remove agent from WSL
sudo dpkg --purge soc-monitor-agent`

  const wslFullSequence = `# === SOC Monitor WSL Linux Installation Sequence ===
# Note: WSL collects Linux subsystem logs, NOT Windows host event logs.

# Step 1: Download Debian package
wget http://${serverHost}:8000/api/v1/agents/download/linux -O soc-monitor-agent.deb

# Step 2: Install package
sudo dpkg -i soc-monitor-agent.deb

# Step 3: Write configuration file
sudo tee /etc/soc-monitor-agent/agent.yml > /dev/null << 'EOF'
collector:
  host: "${serverHost}"
  port: 5000
  tls: false
  auth_token: "${code}"

agent:
  id_file: "/var/lib/soc-monitor-agent/agent_id.txt"
  state_dir: "/var/lib/soc-monitor-agent/state"
  heartbeat_interval: 60
  buffer_max_events: 1000
  collection_interval: 5
  retry_max_delay: 60
  max_payload_bytes: 1048576

linux:
  log_sources:
    - "/var/log/syslog"
    - "/var/log/auth.log"
EOF

# Step 4: Start agent (systemd or background process)
if pidof systemd > /dev/null 2>&1; then
  sudo systemctl restart soc-monitor-agent
  sudo systemctl status soc-monitor-agent
else
  sudo /usr/bin/soc-monitor-agent --config /etc/soc-monitor-agent/agent.yml &
  echo "Agent started in background."
fi`

  const renderInstructions = () => {
    if (os === 'windows') {
      return (
        <div className="space-y-4">
          <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded text-sm text-blue-200">
            <strong>Windows 10/11 Service:</strong> The agent installs as a native Windows service (<code className="text-white font-mono">SOCMonitorAgent</code>) that starts automatically on boot and streams Event Logs (<code className="text-white font-mono">Security</code>, <code className="text-white font-mono">System</code>, <code className="text-white font-mono">Sysmon</code>).
          </div>

          {/* Prominent Copy All Sequence CTA */}
          <CopyAllButton fullText={winFullSequence} label="Windows Installation" />

          {/* Step 1: Download */}
          <div>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Step 1: Download Installer & Package (PowerShell as Administrator)
            </h4>
            <CodeBlock code={winDownloadCmd} label="PowerShell - Download" />
          </div>

          {/* Step 2: Extract */}
          <div>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Step 2: Extract Archive
            </h4>
            <CodeBlock code={winExtractCmd} label="PowerShell - Extract" />
          </div>

          {/* Step 3: Install Service */}
          <div>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Step 3: Install & Enroll Service
            </h4>
            <CodeBlock code={winInstallCmd} label="PowerShell - Install & Enroll" />
          </div>

          {/* Step 4: Verification */}
          <div>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Step 4: Verify Service Status
            </h4>
            <CodeBlock code={winVerifyCmd} label="PowerShell - Verify Service" />
          </div>

          {/* Step 5: Uninstall instructions */}
          <div className="pt-2 border-t border-gray-800/80">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Uninstall & Cleanup (Separate from Dashboard Retirement)
            </h4>
            <p className="text-[11px] text-gray-400 mt-1">
              Retiring the endpoint in SOC Monitor does not stop local services. Run the following script locally to remove the service:
            </p>
            <CodeBlock code={winUninstallCmd} label="PowerShell - Uninstall Service" />
          </div>
        </div>
      )
    }

    if (os === 'linux') {
      return (
        <div className="space-y-4">
          <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded text-sm text-blue-200">
            <strong>Native Linux (Debian/Ubuntu):</strong> The agent installs as a systemd service, starts automatically on boot, and streams <code className="text-white font-mono">/var/log/syslog</code> and <code className="text-white font-mono">/var/log/auth.log</code>.
          </div>

          {/* Prominent Copy All Sequence CTA */}
          <CopyAllButton fullText={linuxFullSequence} label="Linux Installation" />

          {/* Step 1: Download */}
          <div>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Step 1: Download Package
            </h4>
            <CodeBlock code={linuxDownloadCmd} label="Bash - Download .deb" />
          </div>

          {/* Step 2: Install Package */}
          <div>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Step 2: Install Package
            </h4>
            <CodeBlock code={linuxInstallPkgCmd} label="Bash - dpkg Install" />
          </div>

          {/* Step 3: Configure */}
          <div>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Step 3: Write Configuration & Token
            </h4>
            <CodeBlock code={linuxConfigCmd} label="Bash - Configure agent.yml" />
          </div>

          {/* Step 4: Start Service */}
          <div>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Step 4: Enable & Start systemd Service
            </h4>
            <CodeBlock code={linuxStartServiceCmd} label="Bash - Start Service" />
          </div>

          {/* Step 5: Verify */}
          <div>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Step 5: Verify Service Status
            </h4>
            <CodeBlock code={linuxVerifyCmd} label="Bash - Verify Service" />
          </div>

          {/* Uninstall instructions */}
          <div className="pt-2 border-t border-gray-800/80">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Uninstall & Cleanup
            </h4>
            <CodeBlock code={linuxUninstallCmd} label="Bash - Purge Agent" />
          </div>
        </div>
      )
    }

    if (os === 'wsl') {
      return (
        <div className="space-y-4">
          <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded text-sm text-purple-200">
            <strong>WSL Subsystem:</strong> Linux environments running within Windows (WSL). Note that this monitors the Linux subsystem, <strong>NOT</strong> the Windows host itself. WSL background processes pause when the instance exits.
          </div>

          {/* Prominent Copy All Sequence CTA */}
          <CopyAllButton fullText={wslFullSequence} label="WSL Installation" />

          {/* Step 1: Download */}
          <div>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Step 1: Download Package in WSL Terminal
            </h4>
            <CodeBlock code={wslDownloadCmd} label="WSL Bash - Download .deb" />
          </div>

          {/* Step 2: Install Package */}
          <div>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Step 2: Install Package
            </h4>
            <CodeBlock code={wslInstallPkgCmd} label="WSL Bash - dpkg Install" />
          </div>

          {/* Step 3: Configure */}
          <div>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Step 3: Configure Agent with Enrollment Token
            </h4>
            <CodeBlock code={wslConfigCmd} label="WSL Bash - Write agent.yml" />
          </div>

          {/* Step 4a: Start via systemd */}
          <div>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Step 4a: Start via systemd (If systemd=true in /etc/wsl.conf)
            </h4>
            <CodeBlock code={wslStartSystemdCmd} label="WSL Bash - systemd Start" />
          </div>

          {/* Step 4b: Start manually */}
          <div>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Step 4b: Alternative - Start in Background (Non-systemd WSL)
            </h4>
            <CodeBlock code={wslStartManualCmd} label="WSL Bash - Background Process" />
          </div>

          {/* Uninstall instructions */}
          <div className="pt-2 border-t border-gray-800/80">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Uninstall & Cleanup in WSL
            </h4>
            <CodeBlock code={wslUninstallCmd} label="WSL Bash - Purge Agent" />
          </div>
        </div>
      )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden my-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900 z-10 shrink-0">
          <h2 className="text-lg font-medium text-white">Add Endpoint</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && <div className="mb-4 text-sm text-red-400 p-3 bg-red-400/10 border border-red-500/20 rounded">{error}</div>}

          {step === 1 && (
            <div className="space-y-6">
              <p className="text-sm text-gray-400">Select the deployment environment to view accurate installation instructions and generate an enrollment token.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setOs('windows')}
                  className={`p-4 border rounded-lg flex flex-col items-center transition-colors ${os === 'windows' ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 bg-gray-800 hover:border-gray-500'}`}
                >
                  <span className="text-3xl mb-3">🪟</span>
                  <span className="font-medium text-white">Windows</span>
                  <span className="text-xs text-gray-400 mt-1">Windows 10/11, Server</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOs('linux')}
                  className={`p-4 border rounded-lg flex flex-col items-center transition-colors ${os === 'linux' ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 bg-gray-800 hover:border-gray-500'}`}
                >
                  <span className="text-3xl mb-3">🐧</span>
                  <span className="font-medium text-white">Linux</span>
                  <span className="text-xs text-gray-400 mt-1">Native Debian/Ubuntu</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOs('wsl')}
                  className={`p-4 border rounded-lg flex flex-col items-center transition-colors ${os === 'wsl' ? 'border-purple-500 bg-purple-500/10' : 'border-gray-700 bg-gray-800 hover:border-gray-500'}`}
                >
                  <span className="text-3xl mb-3">💻</span>
                  <span className="font-medium text-white">WSL</span>
                  <span className="text-xs text-gray-400 mt-1">Windows Subsystem</span>
                </button>
              </div>
              <div className="flex justify-end pt-4 border-t border-gray-800">
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!os || loading}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded shadow disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Generating...' : 'Next'}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <p className="text-sm text-gray-300">Run the following commands on the target machine to install and authorize the SOC agent.</p>
                <div className="text-xs bg-yellow-900/30 text-yellow-400 px-2.5 py-1 rounded border border-yellow-700/50 flex items-center space-x-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-ping" />
                  <span>Single-use • Expires in 24h</span>
                </div>
              </div>

              {/* Dedicated Enrollment Token Card with Copy Button */}
              <div className="p-3.5 bg-gray-950 border border-gray-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center space-x-2">
                    <span>Generated One-Time Enrollment Token</span>
                    <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-800 px-1.5 py-0.5 rounded">Hashed on Backend</span>
                  </div>
                  <div className="font-mono text-sm text-emerald-400 font-bold break-all mt-1 select-all">
                    {code}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    ⚠️ Sensitive credential. Never share publicly or commit to version control.
                  </p>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        if (navigator?.clipboard?.writeText) {
                          await navigator.clipboard.writeText(code)
                        } else {
                          const textArea = document.createElement("textarea")
                          textArea.value = code
                          textArea.style.position = "fixed"
                          textArea.style.left = "-999999px"
                          document.body.appendChild(textArea)
                          textArea.select()
                          document.execCommand("copy")
                          textArea.remove()
                        }
                        setCopiedToken(true)
                        setTimeout(() => setCopiedToken(false), 2000)
                      } catch {
                        setCopiedToken(false)
                      }
                    }}
                    aria-label="Copy enrollment token"
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded border border-gray-700 transition-colors flex items-center space-x-1.5 justify-center"
                  >
                    {copiedToken ? (
                      <>
                        <span className="text-emerald-400">✓</span>
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <span>📋</span>
                        <span>Copy Token</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleRefreshToken}
                    disabled={loading}
                    title="Generate a fresh enrollment token"
                    aria-label="Generate fresh enrollment token"
                    className="px-2.5 py-1.5 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white text-xs rounded border border-gray-800 transition-colors disabled:opacity-50"
                  >
                    🔄
                  </button>
                </div>
              </div>

              {renderInstructions()}

              <div className="flex justify-between items-center pt-6 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  &larr; Back
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded shadow transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
