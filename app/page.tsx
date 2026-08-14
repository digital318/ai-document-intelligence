import { AlertCircle } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { DashboardMetrics } from "@/components/dashboard/dashboard-metrics";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { RecentDocuments } from "@/components/dashboard/recent-documents";
import { getDashboardData } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userEmail =
    typeof data?.claims?.email === "string" ? data.claims.email : null;

  const dashboard = await getDashboardData();

  return (
    <DashboardLayout userEmail={userEmail}>
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Welcome back
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Here&apos;s an overview of your document intelligence workspace.
        </p>
      </div>

      {dashboard.loadError ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-5 py-4 dark:border-red-500/30 dark:bg-red-500/10">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-400">
            Some dashboard data could not be loaded. Please try again later.
          </p>
        </div>
      ) : null}

      <DashboardMetrics
        metrics={dashboard.metrics}
        error={dashboard.metricsError}
      />

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentDocuments
          documents={dashboard.recentDocuments}
          error={dashboard.documentsError}
        />
        <RecentActivity
          activity={dashboard.recentActivity}
          error={dashboard.activityError}
        />
      </div>
    </DashboardLayout>
  );
}