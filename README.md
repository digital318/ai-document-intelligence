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
- **AI Requests** counts processing-job rows created this calendar month, regardless of file format.

## Phase 6C — Multi-Format Document Analysis

Authenticated users can analyze uploaded documents from the library or the analysis page. The browser sends only the document UUID. The server loads `storage_path` and `mime_type` from the RLS-protected `public.documents` row, downloads the private Storage object, and runs a single processing pipeline for every supported type.

**Supported formats**

- PDF (`application/pdf`)
- Word (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
- Text (`text/plain`)
- JPEG (`image/jpeg`)
- PNG (`image/png`)
- WebP (`image/webp`)

**How each format is analyzed**

- **PDF** — uploaded to OpenAI as a temporary `user_data` file and sent as `input_file`. Analysis can use both extracted text and page-image understanding.
- **DOCX / TXT** — uploaded the same way as `input_file` with purpose `user_data`. Analysis is based on extracted textual content. Embedded images and charts inside non-PDF files are **not** analyzed in this phase.
- **JPEG / PNG / WebP** — uploaded as a temporary vision file and sent as `input_image` with `detail: "original"` so small text and layout are preserved as accurately as practical.

Every attempt writes `public.document_processing_jobs`. The latest structured result is upserted into `public.document_results`. Temporary OpenAI file IDs are deleted after success or failure and are never stored in the database or sent to the browser.

The dashboard Processed, AI Requests, Recent Activity, and Storage Used metrics include every supported format. OCR libraries, embeddings, vector search, and document chat are still out of scope.

## Phase 6D — Processing Hardening, Quality Controls, and Observability

Phase 6D hardens the existing analysis pipeline. It does not add file types, change the configured model, introduce embeddings, vector search, document chat, OCR libraries, external queues, or OpenAI background mode.

**Atomic processing claims**

`public.claim_document_processing(p_document_id uuid)` claims an owned document in a single PostgreSQL transaction. It updates `public.documents.status` to `queued` only when the current status is `uploaded`, `failed`, `processed`, or `needs_review` and `user_id = auth.uid()`, then inserts one `queued` row in `public.document_processing_jobs`. The first concurrent request receives the new job UUID. The second receives no job id and the process route responds with HTTP 409 (`This document is already being processed.`). The function is `SECURITY INVOKER` with `search_path` emptied; RLS still applies. Execute is granted only to `authenticated`.

**OpenAI SDK retries and timeout**

The official OpenAI Node SDK is configured with `maxRetries: 2` and a request timeout of `OPENAI_REQUEST_TIMEOUT_MS` when that value is a positive integer, otherwise 120000 milliseconds. Invalid timeout configuration is ignored. There is no additional application-level retry loop. Authentication, permission, malformed-request, and structured-output validation failures are not retried beyond SDK defaults (the SDK does not retry those classes of error).

**`store: false`**

Document-analysis Responses API requests set `store: false`. Structured business results continue to be persisted in `public.document_results`. OpenAI Response objects and response ids are not stored in application tables. Temporary OpenAI files are still deleted after success or failure.

**Request correlation**

Each analysis call sends the processing-job UUID as an `X-Client-Request-Id` header through the SDK's per-request `headers` option. After a successful response, `response._request_id` is stored in `document_processing_jobs.openai_request_id` for operational troubleshooting. That value is not shown on document or History pages. Server logs may include the job UUID, OpenAI request id, and failure code. Logs do not include document contents, tokens, API keys, passwords, cookies, or Authorization headers.

**Token usage and duration telemetry**

When the Responses API includes usage metadata, `input_tokens`, `output_tokens`, and `total_tokens` are stored on the processing job together with the configured `model_name`. Missing usage does not fail an otherwise successful analysis. Monetary cost is not calculated. Server-side `processing_duration_ms` is measured after a successful claim and persisted on completion or failure.

**Safe failure categories**

Failed jobs store a machine-readable `failure_code` such as `openai_auth`, `openai_rate_limit`, `openai_timeout`, `structured_output`, or `result_persistence`, plus a concise `error_message` diagnostic. Raw provider bodies, stack traces, credentials, and document content are not persisted. The browser receives only generic messages, for example:

- Rate limit or temporary provider problem: `Analysis is temporarily unavailable. Please try again.`
- Configuration or authentication problem: `Analysis service is unavailable.`
- Structured-output or result failure: `Unable to complete analysis. Please try again.`

**Previous successful analysis is preserved**

If a document already has a valid `document_results` row and the user runs Analyze Again, a failed new attempt marks only that processing job as failed. The previous result row is left untouched and remains viewable. Document status is restored to the previous stable value (`processed` or `needs_review`). A document that has never had a successful result is set to `failed`.

**Confidence-based `needs_review`**

After a valid structured analysis, overall `confidence_score >= 0.70` sets document status to `processed`. A lower score sets `needs_review`. The processing job is still `completed` because the AI request succeeded. Field values are not rewritten. Documents in `needs_review` remain fully usable (view analysis, analyze again, view original, download, delete). The analysis page shows a restrained review notice; it does not treat model confidence as a guarantee of correctness. All analyzed documents also show: `AI-generated analysis may contain errors. Verify important information against the original document.`

**History page**

`/history` is an authenticated Server Component that lists the 25 most recent `document_processing_jobs` rows for the current user, with related document names, through the cookie-based Supabase client and RLS. It shows attempt status, job type, created and completed times, duration, model, and token usage when available. Document names link to the analysis page when the document still exists. It does not expose storage paths, OpenAI request ids, error messages, failure codes, or user ids.

Apply `supabase/migrations/20260817193000_phase_6d_processing_hardening.sql` through the project's usual Supabase migration workflow. Do not apply it automatically from the app.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
