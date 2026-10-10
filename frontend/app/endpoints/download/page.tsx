"use client"

import { PageHeader } from '@/components/ui/States'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { useState } from 'react'

export default function DownloadAgentPage() {
  const [activeTab, setActiveTab] = useState<'windows' | 'linux'>('windows')

  const downloadUrl = (os: string) => `http://localhost:8000/api/v1/agents/download/${os}`

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Download Agent"
        description="Deploy SOC Monitor to your endpoints. Select the target operating system for installation instructions."
      />

      <div className="flex space-x-4 border-b border-gray-800 pb-px">
        <button
          onClick={() => setActiveTab('windows')}
          className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'windows'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Windows
        </button>
        <button
          onClick={() => setActiveTab('linux')}
          className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'linux'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Debian / Ubuntu
        </button>
      </div>

      <div className="mt-6">
        {activeTab === 'windows' && (
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader title="Windows Agent Installation" />
            <CardContent className="space-y-6 text-gray-300">
              <div className="bg-[#1e1e24] p-4 rounded-lg border border-gray-800">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-white font-medium">soc-agent-windows.zip</h3>
                    <p className="text-sm text-gray-400">Windows 10, 11, Server 2016+</p>
                  </div>
                  <a
                    href={downloadUrl('windows')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-sm transition-colors"
                  >
                    Download ZIP
                  </a>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-white">Installation Steps</h3>
                <ol className="list-decimal pl-5 space-y-3">
                  <li>Download and extract the ZIP file to <code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-300">C:\Program Files\SOC Monitor Agent</code></li>
                  <li>Open PowerShell as <strong>Administrator</strong>.</li>
                  <li>Navigate to the extraction directory.</li>
                  <li>Edit the <code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-300">config.yaml</code> with your dashboard's enrollment token.</li>
                  <li>
                    Run the installation script to register the Windows Service:
                    <pre className="bg-black p-3 rounded mt-2 border border-gray-800 text-gray-300 font-mono text-sm">
                      .\install_service.ps1
                    </pre>
                  </li>
                  <li>
                    Start the service:
                    <pre className="bg-black p-3 rounded mt-2 border border-gray-800 text-gray-300 font-mono text-sm">
                      Start-Service -Name "SOCMonitorAgent"
                    </pre>
                  </li>
                </ol>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'linux' && (
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader title="Debian / Ubuntu Agent Installation" />
            <CardContent className="space-y-6 text-gray-300">
              <div className="bg-[#1e1e24] p-4 rounded-lg border border-gray-800">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-white font-medium">soc-monitor-agent_0.1.0_amd64.deb</h3>
                    <p className="text-sm text-gray-400">Ubuntu 20.04+, Debian 11+ (amd64)</p>
                  </div>
                  <a
                    href={downloadUrl('linux')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-sm transition-colors"
                  >
                    Download DEB
                  </a>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-white">Installation Steps</h3>
                <ol className="list-decimal pl-5 space-y-3">
                  <li>Download the <code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-300">.deb</code> package to your target machine.</li>
                  <li>
                    Install the package using <code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-300">dpkg</code>:
                    <pre className="bg-black p-3 rounded mt-2 border border-gray-800 text-gray-300 font-mono text-sm">
                      sudo dpkg -i soc-monitor-agent_0.1.0_amd64.deb
                    </pre>
                  </li>
                  <li>
                    Configure your enrollment token in the configuration file:
                    <pre className="bg-black p-3 rounded mt-2 border border-gray-800 text-gray-300 font-mono text-sm">
                      sudo nano /etc/soc-monitor-agent/config.yaml
                    </pre>
                  </li>
                  <li>
                    Enable and start the systemd service:
                    <pre className="bg-black p-3 rounded mt-2 border border-gray-800 text-gray-300 font-mono text-sm">
                      sudo systemctl enable soc-monitor-agent<br />
                      sudo systemctl start soc-monitor-agent
                    </pre>
                  </li>
                </ol>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
