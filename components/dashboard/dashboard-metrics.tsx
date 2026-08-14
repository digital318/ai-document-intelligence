import { Cpu, FileText, HardDrive, Sparkles } from "lucide-react";
import type { DashboardMetrics } from "@/lib/dashboard";
import { formatStorageUsed } from "@/lib/format";

const PLACEHOLDER = "—";

interface MetricCardConfig {
  label: string;
  description: string;
  icon: typeof FileText;
  iconClasses: string;
  value: string;
}

export function DashboardMetrics({
  metrics,
  error,
}: {
  metrics: DashboardMetrics | null;
  error: boolean;
}) {
  const cards: MetricCardConfig[] = [
    {
      label: "Documents",
      description: "Total uploaded",
      icon: FileText,
      iconClasses:
        "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
      value: error ? PLACEHOLDER : String(metrics?.total_documents ?? 0),
    },
    {
      label: "Processed",
      description: "Analysis complete",
      icon: Sparkles,
      iconClasses:
        "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
      value: error ? PLACEHOLDER : String(metrics?.processed_documents ?? 0),
    },
    {
      label: "AI Requests",
      description: "This month",
      icon: Cpu,
      iconClasses:
        "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
      value: error
        ? PLACEHOLDER
        : String(metrics?.ai_requests_this_month ?? 0),
    },
    {
      label: "Storage Used",
      description: "Stored documents",
      icon: HardDrive,
      iconClasses:
        "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
      value: error
        ? PLACEHOLDER
        : formatStorageUsed(metrics?.storage_bytes ?? 0),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                {card.label}
              </p>
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.iconClasses}`}
              >
                <Icon className="h-4.5 w-4.5" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {card.value}
            </p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              {card.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}