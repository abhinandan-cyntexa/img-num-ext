---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — plain HTML/JS, no test runner |
| **Config file** | none |
| **Quick run command** | `python -m http.server 8080` (serves extension) |
| **Full suite command** | Manual: load `-local.trex` in Tableau Desktop, open DevTools console |
| **Estimated runtime** | ~30 seconds per check |

---

## Sampling Rate

- **After every task commit:** Verify file exists and syntax is valid (`node --check extension.js` for JS files)
- **After every plan wave:** Load in Tableau Desktop, check console output matches expected
- **Before `/gsd:verify-work`:** All 5 Phase 1 success criteria must pass in Tableau Desktop

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Manual Check |
|---------|------|------|-------------|-----------|-------------------|--------------|
| 1-01-01 | 01 | 1 | FOUND-03, FOUND-04 | file-exists | `test -f img-num-ext-local.trex && test -f img-num-ext.trex` | Load -local.trex in Tableau Desktop without error |
| 1-01-02 | 01 | 1 | FOUND-01, FOUND-02 | file-exists + syntax | `test -f index.html && test -f extension.js && node --check extension.js` | Extension iframe appears in Tableau worksheet |
| 1-01-03 | 01 | 1 | FOUND-01 | manual | n/a | Console shows worksheet name after initializeAsync resolves |
| 1-01-04 | 01 | 1 | DATA-01 | manual | n/a | Console shows correct column names + values; no reader leak |
| 1-01-05 | 01 | 1 | DATA-02, DATA-03 | manual | n/a | Console shows encoding captions matching DataTable column fieldNames |

---

## Wave 0 Requirements

- No test framework to install — plain static files
- `node --check extension.js` available on any machine with Node.js

*Existing infrastructure (none) — Wave 0 not applicable for this phase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Extension iframe loads without error dialog | FOUND-03 | Requires Tableau Desktop | Load -local.trex via Extension Object, confirm no error popup |
| Console shows worksheet name | FOUND-01 | Requires Tableau Desktop + DevTools | Open Chromium DevTools in extension iframe, check console |
| DataReader returns correct columns | DATA-01 | Requires live Tableau worksheet data | Log column names to console, verify against worksheet field names |
| Encoding captions match DataTable fieldNames | DATA-02, DATA-03 | Requires mapped encoding shelves | Map image URL field + measure in Tableau Marks shelf, check console log |
| No DataReader cursor leak | DATA-01 | Requires repeated filter interactions | Apply 3+ filters in sequence, confirm no errors on subsequent reads |

---

## Validation Sign-Off

- [ ] All tasks have file-exists or manual verify instructions
- [ ] Manual verification steps are specific and reproducible
- [ ] Wave 0 not applicable (no test framework needed)
- [ ] `nyquist_compliant: true` set after manual checks pass

**Approval:** pending
