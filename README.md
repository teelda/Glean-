# Fieldnote

A desktop-first user interview analyser for evidence-backed research synthesis.

## Run locally

1. Install dependencies with `npm install`.
2. Start the app with `npm run dev`.
3. Open `http://localhost:3000`.

The app starts with a complete sample study and stores edits in browser storage. This makes the full curation workflow testable without credentials.

## Production services

Copy `.env.example` to `.env.local`, create a Supabase project, and apply `supabase/migrations/001_initial_schema.sql`. The schema includes owner-scoped row-level security and a private source-file bucket.

`lib/ai-provider.ts` defines the provider boundary. A production adapter must return structured findings containing source segment IDs. Validate every result with `validateTheme` before persistence; findings with missing or non-verbatim evidence must be rejected.

## Included Phase 1 behavior

- Guided study brief
- Anonymous participants and transcript ingestion
- Theme workspace with approve, reject, restore, and edit actions
- Synchronized draggable affinity canvas
- Verbatim evidence drawer with transcript context and comparison
- Stale-analysis state after adding an interview
- CSV evidence export and expiring-share workflow
- PII redaction, strength-label, and evidence-integrity domain rules
- Supabase schema, private storage policies, and owner-level RLS

Phase 2 recording/transcription and report building, and Phase 3 meeting bots/chat, remain isolated behind the future provider interfaces described in the product plan.
