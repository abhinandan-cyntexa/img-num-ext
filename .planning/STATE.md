# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-21)
**Core value:** Each card must reliably show the correct image and correctly formatted number from live Tableau worksheet data — if the image-to-number pairing breaks or the number is wrong, the extension is useless.
**Current focus:** Phase 1

---

## Phase Status

| Phase | Name | Status | Plans |
|-------|------|--------|-------|
| 1 | Foundation | Not started | — |
| 2 | Working Extension | Not started | — |

---

## Current Phase

**Phase 1: Foundation**
Goal: The extension loads inside Tableau Desktop, initializes the Extensions API, and reads worksheet data columns correctly — confirming the manifest, API handshake, encoding field mapping, and data pipeline are all working before any rendering begins.
Next step: Run `/gsd:plan-phase 1`

---

## Accumulated Context

### Key Decisions (from PROJECT.md)

- Use encodings for image + number fields (consistent with reference project pattern)
- CSS Grid for layout (native browser, auto-responsive)
- Comma-only number formatting via `Intl.NumberFormat('en-US')`
- No card label in v1 (deferred)

### Reference Project

Located at: `/Users/abhinandansingh/Documents/cyntexa-dev/Tableau/Custom-Extensions/tableau-viz`
Pattern: `index.html` + `chart.js` (here: `extension.js`) + `.trex` + `-local.trex`

### Critical Pitfalls (from research)

- DataReader MUST be released via `releaseAsync()` in a `finally` block — failure causes silent update stoppage
- `SummaryDataChanged` listener must be registered exactly once inside `initializeAsync().then()`
- All worksheet access must live inside the `await` chain after `initializeAsync()` resolves
- Column lookup must use `fieldCaption` matching — never positional index
- Null guard must cover all four forms: `null`, `"Null"`, `""`, `0`
- `.trex` URL must be `http://localhost:8080/index.html` — exact filename, not bare path
- Use `Number(cell.value)` not `Number(cell.formattedValue)` to avoid double-formatting

### File Structure Target

```
img-num-ext/
├── index.html              # Shell: card-container div, inline CSS, two script tags
├── extension.js            # All logic: init → encoding → data → render → events
├── img-num-ext-local.trex  # Dev manifest (localhost:8080)
└── img-num-ext.trex        # Prod manifest
```

---

## Performance Metrics

- Plans completed: 0
- Requirements delivered: 0 / 20
- Phases completed: 0 / 2

---

*State initialized: 2026-04-21*
