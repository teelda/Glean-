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

Checks are run against a live dev server in headless Chromium at 1440×1000 and
390×844, asserting on measured values rather than screenshots alone:

- Keyboard focus is visible on every interactive element (Tab, then read
  computed `outline`). `.focus()` does **not** trigger `:focus-visible` — press
  the key.
- Every overlay reports `role="dialog"`, `aria-modal`, an `aria-labelledby`
  pointing at a real node; traps Tab; locks body scroll; closes on Escape; and
  returns focus to the trigger.
- No interactive element is smaller than 40×40 on mobile.
- No page scrolls horizontally at 390px.
- Exports are generated from hostile input (a leading `=` and embedded markup)
  and checked for formula injection and unescaped HTML.

## Known visual debt

- The sidebar profile avatar uses `--avatar` (#ead1bb), a tan that appears
  nowhere else in the palette. It should either become a token with a stated
  role or adopt an existing one.
- Several display type sizes (31, 35, 41, 44, 55, 58px) sit outside the type
  scale in `app/globals.css`. They are one-off hero sizes; collapsing them needs
  a design decision, not a find-and-replace.
- The Home page's three-step journey strip restates the sidebar's study steps
  with different labels. One of the two should go.
