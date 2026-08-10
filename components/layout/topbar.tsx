"use client";

import { Bell, LogOut, Menu, Search, User } from "lucide-react";
import { signOut } from "@/app/auth/actions";

interface TopbarProps {
  onMenuClick: () => void;
  userEmail?: string | null;
}

export function Topbar({ onMenuClick, userEmail }: TopbarProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950 sm:px-6 lg:left-64">
      {/* Mobile menu button */}
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 lg:hidden"
        aria-label="Open sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Application title */}
      <h1 className="hidden text-base font-semibold text-zinc-900 dark:text-zinc-50 md:block">
        AI Document Intelligence
      </h1>

      {/* Search */}
      <div className="ml-auto flex max-w-md flex-1 items-center">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            placeholder="Search documents..."
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
      </div>

      {/* Notifications */}
      <button
        type="button"
        className="relative rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-indigo-600" />
      </button>

      {/* Authenticated user */}
      <div className="flex items-center gap-2">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          aria-hidden="true"
        >
          <User className="h-5 w-5" />
        </span>
        {userEmail ? (
          <span
            className="hidden max-w-[10rem] truncate text-sm text-zinc-600 dark:text-zinc-300 sm:inline lg:max-w-[14rem]"
            title={userEmail}
          >
            {userEmail}
          </span>
        ) : null}
        <form action={signOut}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </form>
      </div>
    </header>
  );
}
