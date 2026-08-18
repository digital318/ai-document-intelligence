import type { Metadata } from "next";
import { AlertCircle } from "lucide-react";
import { HistoryList } from "@/components/history/history-list";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getHistoryPageData } from "@/lib/history";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "History",
};

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userEmail =
    typeof data?.claims?.email === "string" ? data.claims.email : null;

  const history = await getHistoryPageData();

  return (
    <DashboardLayout userEmail={userEmail}>
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          History
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          The 25 most recent processing attempts across your documents, newest
          first.
        </p>
      </div>

      {history.loadError ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-5 py-4 dark:border-red-500/30 dark:bg-red-500/10">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-400">
            Unable to load processing history right now. Please try again later.
          </p>
        </div>
      ) : (
        <>
          {history.jobs.length > 0 ? (
            <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
              {history.jobs.length} recent{" "}
              {history.jobs.length === 1 ? "attempt" : "attempts"}
            </p>
          ) : null}
          <HistoryList jobs={history.jobs} />
        </>
      )}
    </DashboardLayout>
  );
}
