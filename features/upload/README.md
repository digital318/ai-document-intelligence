# Upload Feature

Handles ingestion of new documents into the platform.

## Purpose

- Provide drag-and-drop and file-picker upload flows.
- Validate file types and sizes before submission.
- Track upload progress and hand documents off to the AI processing pipeline.

## Structure (planned)

- `components/` — dropzone, upload queue, progress indicators.
- `hooks/` — upload state management and progress tracking.
- `index.ts` — public exports for the feature.
