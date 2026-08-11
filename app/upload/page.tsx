import type { Metadata } from "next";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { DocumentUpload } from "@/features/upload";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Upload Document",
};

export default async function UploadPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userEmail =
    typeof data?.claims?.email === "string" ? data.claims.email : null;

  return (
    <DashboardLayout userEmail={userEmail}>
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Upload Document
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Upload a document to securely store it in your workspace.
        </p>
      </div>

      <div className="max-w-2xl">
        <DocumentUpload />
      </div>
    </DashboardLayout>
  );
}
