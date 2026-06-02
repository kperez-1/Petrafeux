"use client";

import { Sidebar } from "./Sidebar";
import { useDb } from "./DbProvider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { loading, error, remote } = useDb();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Storage banner */}
        {!remote && (
          <div className="flex items-center gap-2 border-b border-yellow-200 bg-yellow-50 px-4 py-1.5 text-xs text-yellow-800">
            <span className="h-2 w-2 rounded-full bg-yellow-400" />
            Local storage — changes stay on this device only
          </div>
        )}
        {remote && !error && (
          <div className="flex items-center gap-2 border-b border-green-200 bg-green-50 px-4 py-1.5 text-xs text-green-800">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Live data (Cloudflare D1)
          </div>
        )}
        {error && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-1.5 text-xs text-red-800">
            Error loading data: {error}
          </div>
        )}
        <main className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              Loading…
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
