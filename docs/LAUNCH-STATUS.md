# Glean launch verification

## Implemented and production-database verified

- Saved forms and draft context in Supabase; owner/editor version-checked saves.
- Owner/editor/reviewer/viewer form roles. Reviewers do not read respondent data.
- Email-bound seven-day invitations, acceptance, revocation and member removal.
- Review comments (refresh every 15 seconds while the tab is visible).
- Published question snapshot separate from editable drafts; closing, expiry and link replacement.
- Response pagination (50 per page), stored-response choice counts and response import into a study.
- Submitted question snapshots preserve the wording associated with new answers.
- Study save conflict checks, failed-load protection, saved study library and reversible archive.
- Error recovery screen and database-probing health endpoint.

## Verification

Run `npm test`, `npm run build`, and `npm run test:e2e` for local regression checks.
`scripts/verify-collaboration.mjs` is the live database integration check. It creates three uniquely named `@example.invalid` test accounts, creates only their test records, and cleans those accounts up in `finally`. It does not send email. The production check passed on 19 September 2026 and verified that all three accounts and their related records were removed. Use a disposable staging database for future routine runs.

The integration test covers cross-account API access, direct RLS reads, editor save, owner-only publishing, stale-version conflicts, email-bound invite acceptance, reviewer/viewer response permissions, consent enforcement, token hashes, responses, analytics, link replacement/closure, member removal, and study isolation.

## External setup still required

- Configure `RESEND_API_KEY` and a verified `EMAIL_FROM` sender in Vercel production. Never add keys to source control. Actual email delivery must be tested with a consenting recipient; invitation links are usable independently of email transport.
- Set an uptime monitor to GET `/api/health` every five minutes and alert the owner on repeated non-200 results. Choose an alert recipient before enabling notifications.
- Review Vercel and Supabase usage/budget controls in their dashboards. Application rate limits are not provider billing caps.
- Establish encrypted database backups, including storage objects if used, then restore into a separate staging database. A passing app test is not a tested backup recovery procedure.
- Configure a production AI provider before advertising automated synthesis. Current context question generation is template-based; source excerpt preparation is not cross-interview synthesis.

## Known limits

- Collaboration uses explicit Save/Reload plus version conflict protection; no simultaneous cursor/text merging.
- Published link tokens cannot be recovered from their hashes. The originating browser session retains the link; an owner on another device can explicitly replace it.
- Older submissions predate question snapshots; their original wording cannot be reconstructed reliably after edits.
- Archiving is recoverable and does not erase data. A full account deletion/retention policy still needs a verified, scoped purge workflow.
- Form library currently returns up to 100 owned and 200 shared forms. Response and study lists are paginated.
- Team membership is scoped to individual forms, not shared study workspaces.
- Automatic response email digests, durable AI jobs, meeting bots and recording transcription are not included.
