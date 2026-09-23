# Multiple Income Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow several named income entries per period and calculate the total automatically.

**Architecture:** Keep `silo_period_incomes`, migrating each legacy amount into one named entry. The repository returns both entry lists and aggregate period totals. The manager shows the selected period's entries and period history; historical detail stays inside the manager and never changes the dashboard selection.

**Tech Stack:** Static HTML, CSS, JavaScript ES modules, native `dialog`, localStorage.

## Global Constraints

- Each entry has a non-empty Vietnamese title of at most 80 characters and a positive safe-integer VND amount.
- The sum for a period must also be a positive safe integer.
- Migrate an old period total to one entry named `Thu nhập`; keep the original intact if migration storage fails.
- Do not add storage keys, dependencies, or affect expense records.
- Keep all data local; preserve Vietnamese copy, 44px touch targets, safe-area spacing, and light/dark themes.
- Bump the service-worker cache generation when changing shipped app files.

---

### Task 1: Migrate totals and persist income entries

**Files:**
- Modify: `storage.js`

**Interfaces:**
- `load()` produces `periodIncomeEntries: { [periodKey]: IncomeEntry[] }` and derived `periodIncomes: { [periodKey]: number }`.
- `savePeriodIncomeEntries(periodKey, entries)` validates, persists, updates repository state, and returns the new period total or `null` for an empty list.
- Existing `savePeriodIncome(periodKey, amount)` remains as a one-entry compatibility wrapper titled `Thu nhập`.

- [ ] **Step 1: Accept both stored formats**

Add an `IncomeEntry` validator requiring a unique non-empty `id`, a trimmed non-empty `title` of at most 80 characters, and a positive safe-integer `amount`. Update income-map validation to accept either a legacy positive integer or a non-empty array of valid entries, and reject a period whose aggregate is not a safe integer.

- [ ] **Step 2: Normalize legacy totals after cycle migration**

Call the existing `migrateCycleSettings()` before normalizing values so it shifts legacy period keys first. Convert each numeric value to `[{ id: `legacy-${periodKey}`, title: 'Thu nhập', amount: value }]`. If any value was converted, write the normalized map once with the existing `write()` helper. Catch a failed write and return `{ ok: false, code: 'STORAGE_WRITE_FAILED', key: KEYS.incomes }`; `localStorage.setItem` leaves the old single-key value intact on failure.

- [ ] **Step 3: Derive period totals and update save methods**

Initialize repository state with the normalized entry map and aggregate totals. Implement `savePeriodIncomeEntries()` to validate the period and full entry list, reject duplicate IDs and unsafe totals, omit the period key for an empty list, write the full income map once, then update both repository maps. Keep `savePeriodIncome()` as a wrapper that saves one `Thu nhập` entry.

**Result:** Existing balances survive migration, new lists remain validated at the storage boundary, and period totals are always derived from entries.

### Task 2: Manage entries in the income sheet

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`

**Interfaces:**
- `#incomeManagerSheet` contains `#incomeCurrent`, `#incomeEntries`, `#incomeHistorySection`, `#incomeHistory`, and the existing empty-state regions.
- `#incomeForm` edits one entry with `#incomeName` and `#incomeAmount`.
- The app uses `state.periodIncomeEntries` for rows and `state.periodIncomes` for totals.

- [ ] **Step 1: Add entry-list and history-detail controls**

Update the manager sheet to show a total card, a `Thêm khoản thu nhập` button, entry rows, an entry-empty state, a `Quay lại kỳ đang xem` button for history detail, and a period-history section. Add a required, 80-character income-name field and an associated error region to the existing income form.

- [ ] **Step 2: Render selected and historical period details**

Track `viewingIncomePeriodKey`, initialized to `null`. In overview mode, render the dashboard-selected period and history totals newest-first. Tapping a history row sets `viewingIncomePeriodKey` and renders its entries in the same sheet while hiding the history list. The back button restores overview mode. Use `textContent` for entry and period labels.

- [ ] **Step 3: Add, edit, and delete entries**

Track both the target period and optional entry ID. Add opens a blank name/amount form; edit opens the same form prefilled. Validate a trimmed name from 1 to 80 characters and an amount greater than zero. Save a new entry with `crypto.randomUUID()` or replace the matching entry, persist through `savePeriodIncomeEntries()`, update both app-state maps, and rerender the dashboard and manager. Delete asks for confirmation, persists the remaining array (or an empty array), then updates both state maps. Historical operations must use their target period key.

- [ ] **Step 4: Style entry rows for touch and both themes**

Use existing theme tokens, 44px minimum edit/delete controls, tabular VND values, readable wrapping for names, and existing sheet safe-area padding. Preserve the numeric keyboard amount accessory on `#incomeAmount` and mark name edits as unsaved form changes.

**Result:** One period can contain any number of named entries; dashboard and history totals update immediately after saves and deletions.

### Task 3: Cache and verify the feature

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Bump the cache**

Change `silo-v14-atomic-shell` to `silo-v15-atomic-shell`.

- [ ] **Step 2: Run syntax and whitespace checks**

Run `node --check app.js`, `node --check storage.js`, `node --check sw.js`, and `git diff --check`. Each command must exit 0.

- [ ] **Step 3: Verify the local UI without changing existing user data**

On an isolated local origin, confirm a legacy total displays as one `Thu nhập` entry; add/edit/delete entries and confirm totals change; open a historical period and return without changing the dashboard selection; confirm an empty period has no total. Inspect the sheet at a phone-sized viewport in light and dark modes. Do not enter test data into the user's existing app origin.

## Plan self-review

- The legacy cycle migration runs before scalar-to-entry conversion, preserving old period ranges.
- Storage writes one serialized income map per operation; unsafe totals and malformed entries fail before persistence.
- Historical details stay in the manager sheet and never write `selectedPeriodKey`.
- Cache delivery, syntax checks, and isolated responsive UI review are included.
