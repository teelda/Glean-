# Glean design QA

## Status

**Superseded by the 2 September 2026 audit.** The previous sign-off on this file
("final result: passed") was a *visual* comparison against a reference image at
two viewports. It did not test behaviour, keyboard access, or assistive
technology, and two of its accessibility claims were measurably wrong:

- It recorded "focusable inputs have visible focus treatment". True — and that
  was precisely the gap: only inputs had one. Every button and link in the app
  computed `outline: none` with no box-shadow, so keyboard users had no focus
  indication anywhere. Fixed with a global `:focus-visible` rule in
  `app/globals.css`.
- It recorded "mobile tap targets are at least 40px". Three `font-size: 0` rules
  collapsed button labels below 760px, leaving a 23×28px "Next finding" control
  and 34×34px icon buttons throughout the form builder. Fixed; all four main
  views now measure ≥40px on a 390×844 viewport.

The lesson for the next pass: a visual diff cannot sign off accessibility.
Drive the app with the keyboard and measure computed styles.

## Current QA method

The checks are executable and committed. They used to live in a scratch
directory and were rewritten from memory each session, which is how this file
came to carry a sign-off nothing could reproduce.

```
pnpm test        # vitest — export escaping, form import, analysis
pnpm test:e2e    # playwright — the app in a real browser
pnpm test:all
```

`playwright test` starts two dev servers, because the auth gate can only be
exercised one way: the middleware fails open with no Supabase credentials, so
one server runs unconfigured (every view reachable) and one runs with stub
credentials no session can satisfy — which is exactly the anonymous case the
gate exists to reject. They build into separate directories; a shared `.next`
makes the two servers overwrite each other.

What is asserted, in `e2e/`:

- **auth** — anonymous callers get 401 from publish and responses, are
  redirected to `/signin?next=…`, and can still open a respondent form and the
  sign-in page. The magic-link callback refuses a code-less link and will not
  redirect off-site.
- **forms** — the builder's lifecycle signals agree with each other: a fresh
  builder, a form restored from a previous visit, and a freshly generated draft
  each read as "Draft" in every place at once, and no share card appears
  without a link behind it.
- **findings** — the index lists every finding, selecting one opens it,
  approving updates the tally and the row together, tags render, and coverage
  never exceeds the interviews actually quoted.
- **shell** — the breadcrumb climbs back out of a study, the rail collapses on
  Forms and can be forced open, and no view scrolls sideways.
- **touch** (Pixel 5) — every visible control measures at least 44×44 and no
  page overflows horizontally.
- **exports** (vitest) — generated from hostile input and checked for formula
  injection and unescaped HTML.

Still checked by hand, not yet automated: keyboard focus visibility, and the
dialog contract (`role`, `aria-modal`, `aria-labelledby`, Tab trapping, scroll
lock, Escape, focus return). `.focus()` does **not** trigger `:focus-visible` —
press the key.

## Known visual debt

- Study chat answers are assembled locally from the study rather than
  retrieved; shared report links, multiple studies, and turning collected form
  responses into findings do not exist yet. Each is absent rather than faked,
  which is the right state — but the UI should keep saying so.
- `Theme.participantCount` is stored and never trusted: coverage is counted
  from the interviews a finding actually quotes. The field should go.
- `.question-type-trigger` is still 40px tall on mobile. It is a styled
  `div`, so the tap-target sweep does not catch it.

Resolved since the previous revision:

- `--avatar` (#ead1bb) now has a stated role in the palette — person identity,
  warm rather than branded, so a face-shaped element never reads as a status
  colour.
- The sidebar and top bar have had their own pass. Both are on the spacing,
  radius and type tokens (with `--nav-w`, `--nav-w-collapsed` and `--tap`
  added for the shell), the top bar is a breadcrumb rather than a flat title
  with a chevron that opened nothing, and the `alert()` behind Help is a toast.
- `FormsView` is down from 27 `useState` hooks to 22, with the lifecycle and
  review flags collapsed into unions. Three bugs went with them: a form
  restored from localStorage claiming to be published with no link, a share
  card showing the previously selected draft's link, and a "queued for the
  analyser" notice outliving the responses it described.
- Findings shows an index of the whole set beside the detail, so the review is
  legible as a whole instead of one card at a time behind Previous/Next.
  `Theme.tags` and `Interview.summary` are rendered rather than merely stored.
- The mobile tap-target floor actually holds. The rules existed but were
  written earlier in the stylesheet than the component rules that set 40px, and
  at equal specificity the later rule wins — so Publish, Continue to context,
  the collapse toggle and every text button were 32–40px on a phone. The floor
  now sits at the end of `app/glean.css`, with a test that fails if it slips.
- The Home journey strip that restated the sidebar steps is gone, and the
  off-scale display sizes were replaced by the type scale in `app/globals.css`.

## Visual system (2 September 2026)

Adopted from the Miro reference, adapted for an application rather than a
marketing site.

- **Typeface** — Figtree via `next/font/google`, standing in for Roobert PRO
  (licensed, not available on Google Fonts). Same slightly-rounded geometric
  character; weights 400 body / 500 headings / 600 labels. Roobert can be
  swapped in later by replacing the `next/font` call with a self-hosted
  `@font-face`; nothing else needs to change.
- **Buttons** — every button is a pill (`--r-pill`), 44px minimum height. Black
  (`--ink`) is the only primary fill.
- **Yellow discipline** — `--yellow` marks the brand, the review stage, and the
  verbatim-quote rule on evidence blocks. It is never a button fill. The
  previous yellow "Generate" CTA was removed for this reason.
- **Pastels** — `--lilac`, `--teal`, `--coral` on 28px cards, Home only, one
  colour per research path. Forms and Reports stay neutral so dense editing and
  long-form reading lead.
- **Scales** — radius 4/8/12/16/20/28/32/pill; spacing on a 4px base with an 8px
  increment; type from 11px labels to a 56px Home display.
- **Elevation** — flat by default. `--e-3`/`--e-4` are reserved for overlays and
  the raised card on hover.

### Not carried over from the reference

Deliberately, because Glean is behind a login: the 80px marketing hero, promo
banner, pricing tiers, logo wall, customer-story cards and the dark multi-column
footer. Home is where you start work, not where you are sold the product.
