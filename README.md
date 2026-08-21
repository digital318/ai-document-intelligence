# AI Document Intelligence

An AI-powered document intelligence platform for secure document analysis, semantic retrieval, and grounded conversational Q&A.

## Live Application

Production URL:

https://ai-document-intelligence-ten.vercel.app

Sign in or create an account to use the app. Do not share production credentials.

## Core Features

- Secure authentication
- Private document upload and storage
- Multi-format document analysis
- Structured AI extraction
- Semantic vector indexing
- Document-specific semantic search
- Grounded RAG Q&A
- Conversational follow-up questions
- Source citations and evidence excerpts
- Prompt-injection defenses
- Per-user RLS isolation
- AI request rate limiting

## Supported Formats

- PDF
- DOCX
- TXT
- JPEG
- PNG
- WebP

## Architecture

The application is a Next.js App Router product. Authentication, PostgreSQL, and private object storage are provided by Supabase. Row Level Security keeps every document, analysis result, processing job, and chunk private to the owning user. Document analysis and embeddings use the OpenAI Responses API and OpenAI embeddings. Semantic retrieval uses pgvector. Production is hosted on Vercel.

```
Browser
  ↓
Next.js
  ↓
Supabase Auth / DB / Storage
  ↓
OpenAI analysis and embeddings
  ↓
pgvector semantic retrieval
  ↓
Grounded document Q&A
```

## RAG Flow

Upload
→ Analyze
→ Chunk
→ Embed
→ Retrieve
→ Answer
→ Validate sources

Each question is answered from retrieved evidence for that document. Follow-up questions stay in the browser for the current page session and are not stored in the database.

## Security

- Private Supabase Storage bucket for uploaded files
- RLS owner isolation on documents, results, jobs, and chunks
- Server-only OpenAI API key (`OPENAI_API_KEY` is never `NEXT_PUBLIC_`)
- Short-lived signed URLs for View Original and Download
- Prompt-injection separation between instructions, questions, history, and document text
- Citation validation (invented source IDs and unverified excerpts are dropped)
- Per-user hourly AI rate limiting
- No service-role credentials in application code
- `store: false` on OpenAI Responses requests where used
- Browser-only temporary Q&A history (cleared on refresh or navigation)

## Production

The live application is deployed on Vercel from the GitHub `main` branch.

Set production environment variables in the Vercel project settings. Confirm Supabase Auth redirect URLs include `https://<production-domain>/auth/callback` and that the `documents` Storage bucket is private.

## Environment Variables

Copy `.env.example` to `.env.local` for local development. Never commit real values.

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server Supabase client |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server Supabase client |
| `NEXT_PUBLIC_SITE_URL` | Canonical site origin for auth email redirects |
| `OPENAI_API_KEY` | Server-only OpenAI client |
| `OPENAI_DOCUMENT_MODEL` | Document analysis, retrieval text, and Q&A |
| `OPENAI_EMBEDDING_MODEL` | Vector embeddings |
| `OPENAI_REQUEST_TIMEOUT_MS` | Optional OpenAI SDK request timeout |

## Local Development

```bash
npm install
cp .env.example .env.local
# Fill in the values listed above.
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run lint
npm run build
```

## Development Milestones

High-level build sequence:

1. Authentication, private storage, and the document library
2. Multi-format AI analysis with structured extraction
3. Vector indexing, semantic retrieval, and grounded conversational Q&A
4. Production hardening, Vercel deployment, and portfolio polish

### Architecture notes

The later phases added pgvector indexing, document-scoped retrieval, grounded Ask This Document, conversational follow-ups, citation excerpt validation, AI rate limiting, security headers, and a production Vercel deployment. Cross-document Q&A, billing, persistent chat tables, and analytics vendors are intentionally out of scope.
