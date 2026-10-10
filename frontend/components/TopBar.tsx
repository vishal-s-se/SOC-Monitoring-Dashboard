"use client";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { usePathname } from "next/navigation";

export default function TopBar() {
  const pathname = usePathname();
  const { status: wsStatus } = useWebSocket();
  const [apiStatus, setApiStatus] = useState<"ONLINE" | "OFFLINE" | "CHECKING">("CHECKING");

  useEffect(() => {
    if (pathname === '/login') return;
    // We check API health occasionally
    const checkApi = async () => {
      try {
        await api.get("/agents?limit=1");
        setApiStatus("ONLINE");
      } catch (err) {
        setApiStatus("OFFLINE");
      }
    };
    checkApi();
    const interval = setInterval(checkApi, 10000);
    return () => clearInterval(interval);
  }, [pathname]);

  if (pathname === '/login') return null;

  return (
    <header className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 shrink-0 text-white">
      <div className="flex items-center space-x-4">
        {/* We can put breadcrumbs or search here later */}
        <div className="text-lg font-semibold text-gray-200">
          SOC Monitor <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded ml-2">MAIN ENVIRONMENT</span>
        </div>
      </div>

      <div className="flex items-center space-x-6">
        {/* REST API Status */}
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-gray-400">API:</span>
          <div className="flex items-center space-x-1">
            <span className={`h-2 w-2 rounded-full ${apiStatus === 'ONLINE' ? 'bg-green-500' : apiStatus === 'OFFLINE' ? 'bg-red-500' : 'bg-yellow-500'}`} />
            <span className="text-gray-200">{apiStatus}</span>
          </div>
        </div>

        {/* WebSocket Status */}
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-gray-400">Real-Time:</span>
          <div className="flex items-center space-x-1">
            <span className={`h-2 w-2 rounded-full ${
              wsStatus === 'CONNECTED' ? 'bg-green-500'
              : wsStatus === 'ERROR' ? 'bg-red-500'
              : 'bg-yellow-500'
            }`} />
            <span className="text-gray-200">{wsStatus}</span>
          </div>
        </div>

        {/* User Profile */}
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-semibold cursor-pointer">
            A
          </div>
          <button 
            onClick={async () => {
              try {
                await api.post('/auth/logout', {});
              } catch (e) {
                console.error('Logout failed', e);
              }
              window.location.href = '/login';
            }}
            className="text-xs text-gray-400 hover:text-white transition-colors border border-gray-700 hover:border-gray-500 px-2 py-1 rounded"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
