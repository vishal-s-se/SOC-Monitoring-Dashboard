"use client";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { AddEndpointModal } from "@/components/ui/AddEndpointModal";
import { AlertToastNotification } from "@/components/AlertToastNotification";

export default function TopBar() {
  const pathname = usePathname();
  const { status: wsStatus } = useWebSocket();
  const [apiStatus, setApiStatus] = useState<"ONLINE" | "OFFLINE" | "CHECKING">("CHECKING");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    if (pathname === '/login') return;
    let isCancelled = false;
    let interval: NodeJS.Timeout | null = null;

    const checkApi = async () => {
      try {
        await api.get("/agents/?limit=1");
        if (!isCancelled) {
          setApiStatus("ONLINE");
        }
      } catch (err: any) {
        if (!isCancelled) {
          setApiStatus("OFFLINE");
          if (err?.status === 401 && interval) {
            clearInterval(interval);
          }
        }
      }
    };
    checkApi();
    interval = setInterval(checkApi, 30000);
    return () => {
      isCancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

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
            SOCForge <span className="text-xs text-blue-400 bg-blue-950/80 border border-blue-800/60 px-2 py-0.5 rounded ml-2 hidden sm:inline-block font-mono">COMMAND CENTER</span>
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

          {/* Prominent Subtly Glowing Generate Report CTA Button */}
          <Link
            href="/reports"
            aria-label="Open guided PDF report generator wizard"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold tracking-wide border border-cyan-400/60 transition-all duration-200 shadow-md shadow-cyan-950/50 hover:shadow-cyan-500/20 active:scale-95"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Generate Report</span>
          </Link>
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

        {/* User Profile & Actions */}
        <div className="flex items-center space-x-2.5">
          <Link
            href="/help"
            title="Help & Documentation"
            className="flex items-center space-x-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors bg-blue-950/40 hover:bg-blue-900/40 border border-blue-800/80 hover:border-blue-700 px-2.5 py-1 rounded"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="font-medium">Help & Docs</span>
          </Link>
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
              window.location.href = '/login?logout=1';
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
