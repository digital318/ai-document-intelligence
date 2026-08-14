import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Cpu,
  FileText,
  XCircle,
} from "lucide-react";
import type {
  DashboardActivityItem,
  DashboardActivityKind,
} from "@/lib/dashboard";
import { formatRelativeTime } from "@/lib/format";

const ACTIVITY_ICONS: Record<
  DashboardActivityKind,
  {
    icon: typeof FileText;
    iconClasses: string;
  }
> = {
  upload: {
    icon: FileText,
    iconClasses:
      "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
  },
  processing_queued: {
    icon: Clock,
    iconClasses: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
  },
  processing_started: {
    icon: Cpu,
    iconClasses:
      "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  },
  processing_completed: {
    icon: CheckCircle2,
    iconClasses:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  processing_failed: {
    icon: XCircle,
    iconClasses: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  },
};

export function RecentActivity({
  activity,
  error,
}: {
  activity: DashboardActivityItem[];
  error: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Recent Activity
        </h3>
      </div>

      {error ? (
        <div className="flex items-start gap-2.5 px-5 py-8">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-400">
            Unable to load recent activity right now.
          </p>
        </div>
      ) : activity.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
            <Clock className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            No activity yet
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Document and processing activity will appear here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {activity.map((item) => {
            const { icon: Icon, iconClasses } = ACTIVITY_ICONS[item.kind];
            return (
              <li
                key={item.id}
                className="flex items-start gap-3 px-5 py-3.5"
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClasses}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {item.text}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {formatRelativeTime(item.timestamp)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}