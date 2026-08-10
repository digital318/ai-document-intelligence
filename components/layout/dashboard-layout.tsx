"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

interface DashboardLayoutProps {
  children: ReactNode;
  userEmail?: string | null;
}

export function DashboardLayout({ children, userEmail }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Topbar
        onMenuClick={() => setSidebarOpen(true)}
        userEmail={userEmail}
      />

      {/* Scrollable content area, offset for fixed sidebar and topbar */}
      <main className="pt-16 lg:pl-64">
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
