import {
  Clock,
  Cpu,
  FileText,
  HardDrive,
  Sparkles,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { createClient } from "@/lib/supabase/server";

const stats = [
  {
    label: "Documents",
    value: "0",
    description: "Total uploaded",
    icon: FileText,
    iconClasses: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
  },
  {
    label: "Processed",
    value: "0",
    description: "Analysis complete",
    icon: Sparkles,
    iconClasses: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  {
    label: "AI Requests",
    value: "0",
    description: "This month",
    icon: Cpu,
    iconClasses: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  },
  {
    label: "Storage Used",
    value: "0 MB",
    description: "Of available space",
    icon: HardDrive,
    iconClasses: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  },
];

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userEmail =
    typeof data?.claims?.email === "string" ? data.claims.email : null;

  return (
    <DashboardLayout userEmail={userEmail}>
      {/* Welcome heading */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Welcome back
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Here&apos;s an overview of your document intelligence workspace.
        </p>
      </div>

      {/* Statistic cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  {stat.label}
                </p>
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.iconClasses}`}
                >
                  <Icon className="h-4.5 w-4.5" />
                </span>
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                {stat.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Placeholder cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Recent Documents
            </h3>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
              <FileText className="h-6 w-6" />
            </span>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              No documents yet
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Uploaded documents will appear here.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Recent Activity
            </h3>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
              <Clock className="h-6 w-6" />
            </span>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              No activity yet
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Processing and AI activity will appear here.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
