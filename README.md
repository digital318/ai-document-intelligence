This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Phase 3 — Backend Foundation (Supabase)

The migration `supabase/migrations/20260805193000_phase_3_backend_foundation.sql` sets up the backend schema:

- **Tables**
  - `public.profiles` — one row per auth user, auto-created by a trigger on `auth.users`.
  - `public.documents` — metadata for uploaded files (name, storage path, MIME type, size, status).
  - `public.document_processing_jobs` — async AI processing queue, one or more jobs per document.
  - `public.document_results` — AI analysis output (summary, extracted fields, confidence), one row per document.
- **Storage** — a private `documents` bucket (25 MiB limit; PDF, JPEG, PNG, WebP, DOCX, and plain-text only). Files must be stored at `<user-id>/<document-id>/<filename>`; storage policies only allow users to access objects under their own user-id folder.
- **Security** — Row Level Security is enabled on all four tables and all policies are scoped to the `authenticated` role, so every read/write requires a signed-in user who owns the row (directly or via the parent document). There is no anonymous access.
- **Deferred** — chat, embeddings, and document-chunk tables are intentionally not part of this phase.

## Phase 5D — Live Dashboard

The authenticated dashboard at `/` reads live per-user data through the cookie-based server Supabase client. Row Level Security remains the access boundary; the app never uses a service-role or secret key for dashboard queries.

- **Metrics** — `public.get_dashboard_metrics()` (see `supabase/migrations/20260814_phase_5d_dashboard_metrics.sql`) returns `total_documents`, `processed_documents`, `ai_requests_this_month`, and `storage_bytes` for `auth.uid()` only. The function is `SECURITY INVOKER`, filters `user_id = auth.uid()`, and is executable only by `authenticated`.
- **Recent documents** — the five newest rows from `public.documents` (name, MIME type, size, status, created time). Items link to `/documents`; storage paths are never exposed.
- **Recent activity** — derived in application code from recent document uploads and `public.document_processing_jobs` (queued / started / completed / failed). There is no separate activity table; deleting a document may remove its upload entry from this feed.
- **AI Requests** currently counts processing-job rows created this calendar month. Actual OpenAI processing, OCR, embeddings, and document chat are deferred to a later phase, so this metric is expected to stay `0` until then.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
