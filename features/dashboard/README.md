# Dashboard Feature

Provides the main overview screen of the AI Document Intelligence Platform.

## Purpose

- Display high-level metrics (documents processed, recent activity, usage stats).
- Surface quick actions and shortcuts to other features (upload, documents, history).
- Aggregate insights extracted from documents into summary widgets.

## Structure (planned)

- `components/` — dashboard-specific UI (stat cards, charts, activity feed).
- `hooks/` — data-fetching and state hooks scoped to the dashboard.
- `index.ts` — public exports for the feature.
