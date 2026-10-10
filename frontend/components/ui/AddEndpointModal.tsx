"use client"

import { useState } from 'react'
import { api } from '@/lib/api'

export function AddEndpointModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [step, setStep] = useState<1|2>(1)
  const [os, setOs] = useState<'windows'|'linux'|'wsl'|null>(null)
  const [code, setCode] = useState("")
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

  // Ensure window.location.hostname works for dynamic host injection
  const serverHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'

  const renderInstructions = () => {
    if (os === 'windows') {
      return (
        <div className="space-y-4">
          <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded text-sm text-blue-200">
            <strong>Windows 10/11 Service:</strong> The agent installs as a native Windows service (SOCMonitorAgent) that runs silently, starts on boot, and collects local Event Logs (Security, System, Sysmon).
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-300">1. Open PowerShell as Administrator</h4>
            <p className="text-xs text-gray-400 mt-1">Right-click the Start button and select "Windows PowerShell (Admin)" or "Terminal (Admin)".</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-300">2. Download & Install</h4>
            <pre className="mt-2 p-3 bg-black rounded text-xs text-green-400 overflow-x-auto">
{`# 1. Download installer script and binaries
Invoke-WebRequest -Uri "http://${serverHost}:8000/api/v1/agents/download/script/windows/install" -OutFile "Install-SOCAgent.ps1"
Invoke-WebRequest -Uri "http://${serverHost}:8000/api/v1/agents/download/windows" -OutFile "soc-agent-windows.zip"

# 2. Extract agent
Expand-Archive soc-agent-windows.zip -DestinationPath . -Force

# 3. Install and enroll (Make sure CollectorHost points to your collector)
.\\Install-SOCAgent.ps1 -CollectorHost "${serverHost}" -CollectorPort 5000 -AuthToken "${code}"`}
            </pre>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-300">Uninstalling</h4>
            <p className="text-xs text-gray-400 mt-1">To remove the agent later, download and run <code>Uninstall-SOCAgent.ps1</code> or remove the service <code>SOCMonitorAgent</code> manually.</p>
          </div>
        </div>
      )
    }

    if (os === 'linux') {
      return (
        <div className="space-y-4">
          <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded text-sm text-blue-200">
            <strong>Native Linux (Debian/Ubuntu):</strong> The agent installs as a systemd service, starts automatically, and securely streams syslog/auth logs natively.
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-300">1. Download & Install</h4>
            <pre className="mt-2 p-3 bg-black rounded text-xs text-green-400 overflow-x-auto">
{`wget http://${serverHost}:8000/api/v1/agents/download/linux -O soc-monitor-agent.deb
sudo dpkg -i soc-monitor-agent.deb`}
            </pre>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-300">2. Configure Authentication</h4>
            <pre className="mt-2 p-3 bg-black rounded text-xs text-green-400 overflow-x-auto">
{`sudo nano /etc/soc-monitor-agent/agent.yml
# Update host, port, and set auth_token to: ${code}`}
            </pre>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-300">3. Start the Service</h4>
            <pre className="mt-2 p-3 bg-black rounded text-xs text-green-400 overflow-x-auto">
{`sudo systemctl enable soc-monitor-agent
sudo systemctl restart soc-monitor-agent`}
            </pre>
            <p className="text-xs text-gray-400 mt-2">Verify it's running: <code>sudo systemctl status soc-monitor-agent</code></p>
          </div>
        </div>
      )
    }

    if (os === 'wsl') {
      return (
        <div className="space-y-4">
          <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded text-sm text-purple-200">
            <strong>WSL Subsystem:</strong> Linux environments running within Windows (WSL). By default, WSL does not run systemd unless enabled in <code>wsl.conf</code>, and background services die when the WSL instance stops. This monitors Linux logs inside the subsystem, NOT the Windows host itself.
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-300">1. Download & Install</h4>
            <pre className="mt-2 p-3 bg-black rounded text-xs text-green-400 overflow-x-auto">
{`wget http://${serverHost}:8000/api/v1/agents/download/linux -O soc-monitor-agent.deb
sudo dpkg -i soc-monitor-agent.deb`}
            </pre>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-300">2. Configure Agent</h4>
            <pre className="mt-2 p-3 bg-black rounded text-xs text-green-400 overflow-x-auto">
{`sudo nano /etc/soc-monitor-agent/agent.yml
# Update host, port, and set auth_token to: ${code}`}
            </pre>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-300">3. Run the Agent</h4>
            <p className="text-xs text-gray-400 mt-1">If you have systemd enabled (Ubuntu 22.04+ with systemd=true in /etc/wsl.conf):</p>
            <pre className="mt-2 mb-3 p-3 bg-black rounded text-xs text-green-400 overflow-x-auto">
{`sudo systemctl restart soc-monitor-agent`}
            </pre>
            <p className="text-xs text-gray-400 mt-1">Otherwise, run it manually in the background:</p>
            <pre className="mt-2 p-3 bg-black rounded text-xs text-green-400 overflow-x-auto">
{`sudo /usr/bin/soc-monitor-agent --config /etc/soc-monitor-agent/agent.yml &`}
            </pre>
          </div>
        </div>
      )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-xl w-full max-w-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between p-4 border-b border-gray-800 sticky top-0 bg-gray-900">
          <h2 className="text-lg font-medium text-white">Add Endpoint</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </div>
        
        <div className="p-6">
          {error && <div className="mb-4 text-sm text-red-400 p-3 bg-red-400/10 border border-red-500/20 rounded">{error}</div>}
          
          {step === 1 && (
            <div className="space-y-6">
              <p className="text-sm text-gray-400">Select the deployment environment to view accurate installation instructions and generate an enrollment token.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => setOs('windows')}
                  className={`p-4 border rounded-lg flex flex-col items-center transition-colors ${os === 'windows' ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 bg-gray-800 hover:border-gray-500'}`}
                >
                  <span className="text-3xl mb-3">🪟</span>
                  <span className="font-medium text-white">Windows</span>
                  <span className="text-xs text-gray-400 mt-1">Windows 10/11, Server</span>
                </button>
                <button
                  onClick={() => setOs('linux')}
                  className={`p-4 border rounded-lg flex flex-col items-center transition-colors ${os === 'linux' ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 bg-gray-800 hover:border-gray-500'}`}
                >
                  <span className="text-3xl mb-3">🐧</span>
                  <span className="font-medium text-white">Linux</span>
                  <span className="text-xs text-gray-400 mt-1">Native Debian/Ubuntu</span>
                </button>
                <button
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
                <div className="text-xs bg-yellow-900/30 text-yellow-500 px-2 py-1 rounded border border-yellow-700/50">
                  Token expires in 24 hours
                </div>
              </div>
              
              {renderInstructions()}

              <div className="flex justify-between items-center pt-6 border-t border-gray-800">
                <button
                  onClick={() => setStep(1)}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  &larr; Back
                </button>
                <button
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
