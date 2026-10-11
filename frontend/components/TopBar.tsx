"use client";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { usePathname } from "next/navigation";
import { AddEndpointModal } from "@/components/ui/AddEndpointModal";
import { AlertToastNotification } from "@/components/AlertToastNotification";

export default function TopBar() {
  const pathname = usePathname();
  const { status: wsStatus } = useWebSocket();
  const [apiStatus, setApiStatus] = useState<"ONLINE" | "OFFLINE" | "CHECKING">("CHECKING");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

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
    <>
      <AlertToastNotification />
      <AddEndpointModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
      <header className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 shrink-0 text-white">
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className="text-lg font-semibold text-gray-200 flex items-center">
            SOC Monitor <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded ml-2 hidden sm:inline-block">MAIN ENVIRONMENT</span>
          </div>

          {/* Persistent Glowing Add Endpoint CTA Button */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            aria-label="Add new endpoint agent"
            className="animate-glow-pulse flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-semibold tracking-wide border border-blue-400/80 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900 shadow-lg active:scale-95"
          >
            <span className="text-sm font-bold leading-none">+</span>
            <span>Add Endpoint</span>
          </button>
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
    </>
  );
}
