import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_VERSION_DISPLAY,
} from "@/lib/app-info";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/login");
  }

  const userEmail =
    typeof data.claims.email === "string" ? data.claims.email : null;

  return (
    <DashboardLayout userEmail={userEmail}>
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Settings
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage account and application information.
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        <section
          aria-labelledby="settings-account-heading"
          className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h3
              id="settings-account-heading"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Account
            </h3>
          </div>
          <dl className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                Email
              </dt>
              <dd
                className="mt-1 truncate text-sm text-zinc-900 dark:text-zinc-50"
                title={userEmail ?? undefined}
              >
                {userEmail ?? "Unavailable"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                Status
              </dt>
              <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-50">
                Authenticated
              </dd>
            </div>
          </dl>
        </section>

        <section
          aria-labelledby="settings-application-heading"
          className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h3
              id="settings-application-heading"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Application
            </h3>
          </div>
          <dl className="space-y-4 px-5 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                  Application
                </dt>
                <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-50">
                  {APP_NAME}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                  Version
                </dt>
                <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-50">
                  {APP_VERSION_DISPLAY}
                </dd>
              </div>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                Description
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-zinc-900 dark:text-zinc-50">
                {APP_DESCRIPTION}
              </dd>
            </div>
          </dl>
        </section>

        <section
          aria-labelledby="settings-privacy-heading"
          className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h3
              id="settings-privacy-heading"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Privacy & AI
            </h3>
          </div>
          <div className="space-y-3 px-5 py-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            <p>
              Documents are private to the authenticated account.
            </p>
            <p>
              AI-generated analysis and answers may contain errors. Important
              information should be verified against the original document.
            </p>
            <p>
              Ask This Document conversation history is temporary and is not
              saved.
            </p>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
