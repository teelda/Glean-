# Glean

A desktop-first research workspace: interviews and forms in, evidence-backed findings and a stakeholder-ready report out.

## Run locally

1. `npm install`
2. `npm run dev`
3. Open `http://localhost:3000`

The app opens on a complete sample study and stores edits in browser storage, so the full curation workflow is testable without credentials.

## Tests

`npm test` — covers the domain rules (`lib/analysis.ts`), the research-document
importer (`lib/form-import.ts`), and the export encoders (`lib/export.ts`).

## Production services

Copy `.env.example` to `.env.local`, create a Supabase project, and apply the migrations in `supabase/migrations/`.

`lib/ai-provider.ts` defines the provider boundary. A production adapter must return structured findings containing source segment IDs. Validate every result with `validateTheme` before persistence; findings with missing or non-verbatim evidence must be rejected.

## What works today

- Guided study brief, anonymous participants, transcript ingestion (paste, TXT, DOCX, PDF, drag-and-drop)
- Theme workspace with approve, reject and restore, each finding showing every linked quote
- Participant coverage derived from the interviews a finding actually quotes
- Evidence drawer with transcript context, verbatim matching, and a warning when a quote cannot be matched to the stored transcript
- Stale-analysis state after interviews change
- Research-document import (DOCX/PDF/TXT) into editable form drafts, with optional splitting by question purpose
- Public form publishing, respondent form with consent gating, response collection and reading
- CSV and Word exports (both escape untrusted transcript text) and print-to-PDF

## Not built yet

These are deliberately absent rather than stubbed, so nothing in the UI claims
them:

- **Authentication.** There is no sign-in. Migration 001's owner-scoped RLS is
  written but unreachable, and the form API routes are unauthenticated — do not
  expose a deployment publicly as-is.
- **Shared report links.** The `share_links` table exists; nothing writes to it.
  Use the export menu instead.
- **Study chat.** The modal shows the intended interaction only. It needs
  retrieval, citations, refusal behaviour and answer validation before it can
  answer from a study.
- **Multiple studies.** The workspace holds one study at a time; starting a new
  one replaces it (behind a confirmation).
- **Response analysis.** Form responses are collected and readable, but are not
  yet turned into findings.
- **Affinity canvas, recording and meeting bots.** Phase 2/3, behind the
  provider interfaces described in the product plan.
