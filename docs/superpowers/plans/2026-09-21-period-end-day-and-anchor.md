# Period end day with a start anchor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single recurring `cycleStartDay` with a recurring period **end** day plus an optional **anchor** date on which the first period starts, keeping periods contiguous.

**Architecture:** `logic.js` owns the period model as pure functions: a period is keyed by the month it **ends** in, its end boundary is `min(endDay, daysInMonth)`, its start is the day after the previous boundary, and the anchor replaces the start of the first period. `storage.js` owns persistence plus a one-time fail-closed migration from the legacy `silo_cycle_start_day` key, which also shifts stored income keys by one month. `app.js` / `index.html` / `styles.css` expose the two settings, a live sequence preview, a date-range period title, and a section for expenses that predate the anchor.

**Tech Stack:** Static ESM JavaScript, no build step, no dependencies. Tests run on Node's built-in runner (`node --test`). Language: Vietnamese UI copy, VND.

**Spec:** `docs/superpowers/specs/2026-09-21-period-start-end-day-design.md`

## Global Constraints

- **No new dependencies, no build step.** `package.json` keeps its single `test` script.
- **Money is a positive safe integer** everywhere; periods and incomes are keyed `YYYY-MM`.
- **UI copy is Vietnamese, verbatim** from the spec (see each task). Do not invent new copy.
- **Touch targets stay ≥ 44px** and existing `:focus-visible` / safe-area behaviour is preserved.
- **`sw.js` `CACHE_NAME` must be bumped** in Task 4, or the installed PWA keeps serving the old bundle. It must keep the shape `silo-<something>` (asserted by `tests/icon-assets.test.js`).
- **Every commit keeps `npm test` green.** 36 tests pass at the start of this plan.
- **Tasks 1–3 leave the app temporarily non-runnable against the new model** — `app.js` still passes `state.cycleStartDay` where an end day is expected. That is deliberate: nothing is deployed until Task 4's cache bump, and keeping the *suite* green at every commit preserves `git bisect`. Do not paper over it with a compatibility shim.
- **Do not add a DOM test harness.** UI behaviour is verified by the owner on the iPhone; source-level assertions go in `tests/static.test.js` only where they guard a real mistake (a half-finished rename, a class name that must exist in both files).

---

### Task 1: The period model in `logic.js`

**Files:**
- Modify: `logic.js`
- Test: `tests/logic.test.js`

**Interfaces:**
- Consumes: existing `parsePeriodKey`, `startDateForPeriod`, `shiftPeriodKey`, `parseDateKey`, `daysInMonth`, `shortDate`, `monthKey`.
- Produces:
  - `periodBounds(periodKey, endDay, anchor = null) → { key, startDate, endDate, rangeLabel }`. `endDate` is the end boundary, `startDate` is the previous boundary + 1 day, replaced by `anchor` when the anchor falls in `(chainStart, endDate]`. Throws `TypeError` unless `endDay` is an integer 1–31. The old `label` and `nextStartDate` fields are gone.
  - `periodKeyForDate(dateKey, endDay) → YYYY-MM` — the month the containing period ends in.
  - `expensesForPeriod(expenses, bounds, categoryId = 'all') → expense[]` over the inclusive range.
  - `expensesBeforeAnchor(expenses, anchor, categoryId = 'all') → expense[]`, empty when `anchor` is `null`/empty.
  - Internal only: `nextDay(dateKey)`, `newestFirst(left, right)`.

- [ ] **Step 1: Write the failing tests**

In `tests/logic.test.js`, add `expensesBeforeAnchor` to the import list, then replace the three `periodBounds` tests plus the cross-year label test (currently lines 20–43) with:

```javascript
test('a period ends on the recurring end day and starts the day after the previous one', () => {
  assert.deepEqual(periodBounds('2026-09', 31), {
    key: '2026-09', startDate: '2026-09-01', endDate: '2026-09-30', rangeLabel: '01/09–30/09',
  });
  assert.deepEqual(periodBounds('2026-10', 24), {
    key: '2026-10', startDate: '2026-09-25', endDate: '2026-10-24', rangeLabel: '25/09–24/10',
  });
});

test('end day 31 clamps to a short month and stays contiguous', () => {
  assert.deepEqual(periodBounds('2027-02', 31), {
    key: '2027-02', startDate: '2027-02-01', endDate: '2027-02-28', rangeLabel: '01/02–28/02',
  });
  assert.equal(periodBounds('2028-02', 31).endDate, '2028-02-29');
  assert.equal(periodBounds('2027-03', 31).startDate, '2027-03-01');
});

test('end day 30 loses a day to February without overlapping', () => {
  assert.equal(periodBounds('2027-01', 30).endDate, '2027-01-30');
  assert.equal(periodBounds('2027-02', 30).startDate, '2027-01-31');
  assert.equal(periodBounds('2027-02', 30).endDate, '2027-02-28');
  assert.equal(periodBounds('2027-03', 30).startDate, '2027-03-01');
});

test('an anchor replaces the start of the first period only', () => {
  assert.deepEqual(periodBounds('2026-10', 10, '2026-09-21'), {
    key: '2026-10', startDate: '2026-09-21', endDate: '2026-10-10', rangeLabel: '21/09–10/10',
  });
  assert.equal(periodBounds('2026-11', 10, '2026-09-21').startDate, '2026-10-11');
  assert.equal(periodBounds('2026-09', 10, '2026-09-21').endDate, '2026-09-10');
});

test('every end day keeps periods contiguous and keys distinct', () => {
  for (let endDay = 1; endDay <= 31; endDay++) {
    const keys = [];
    for (let index = 0; index < 30; index++) {
      const key = shiftPeriodKey('2026-01', index);
      const bounds = periodBounds(key, endDay);
      const before = periodBounds(shiftPeriodKey(key, -1), endDay);
      assert.ok(bounds.startDate <= bounds.endDate, `${key}/${endDay} inverted`);
      const expected = new Date(`${before.endDate}T00:00:00Z`);
      expected.setUTCDate(expected.getUTCDate() + 1);
      assert.equal(bounds.startDate, expected.toISOString().slice(0, 10), `${key}/${endDay} broke contiguity`);
      keys.push(bounds.key);
    }
    assert.equal(new Set(keys).size, keys.length, `duplicate key for end day ${endDay}`);
  }
});
```

Then replace the `periodKeyForDate` test and the `period filtering uses inclusive start and exclusive next start` test with:

```javascript
test('a date resolves to the period that contains it', () => {
  assert.equal(periodKeyForDate('2026-10-10', 10), '2026-10');
  assert.equal(periodKeyForDate('2026-10-11', 10), '2026-11');
  assert.equal(periodKeyForDate('2026-09-24', 24), '2026-09');
  assert.equal(periodKeyForDate('2026-09-25', 24), '2026-10');
  assert.equal(periodKeyForDate('2026-10-24', 24), '2026-10');
  assert.equal(periodKeyForDate('2026-10-25', 24), '2026-11');
});

test('period filtering uses the inclusive start and end dates', () => {
  const expenses = [
    { id: 'a', title: 'A', amount: 10, date: '2026-09-24', catId: 'food' },
    { id: 'b', title: 'B', amount: 20, date: '2026-09-25', catId: 'food' },
    { id: 'c', title: 'C', amount: 30, date: '2026-10-24', catId: 'saving' },
    { id: 'd', title: 'D', amount: 40, date: '2026-10-25', catId: 'food' },
  ];
  const bounds = periodBounds('2026-10', 24);
  assert.deepEqual(expensesForPeriod(expenses, bounds).map(item => item.id), ['c', 'b']);
  assert.deepEqual(expensesForPeriod(expenses, bounds, 'food').map(item => item.id), ['b']);
});

test('expenses before the anchor are reported and honour the category filter', () => {
  const expenses = [
    { id: 'a', title: 'A', amount: 10, date: '2026-09-20', catId: 'food' },
    { id: 'b', title: 'B', amount: 20, date: '2026-09-21', catId: 'food' },
    { id: 'c', title: 'C', amount: 30, date: '2026-09-01', catId: 'saving' },
  ];
  assert.deepEqual(expensesBeforeAnchor(expenses, '2026-09-21').map(item => item.id), ['a', 'c']);
  assert.deepEqual(expensesBeforeAnchor(expenses, '2026-09-21', 'food').map(item => item.id), ['a']);
  assert.deepEqual(expensesBeforeAnchor(expenses, null), []);
});
```

Finally, in the existing `expense filtering does not mutate the source array` test, the period key is now the month the period ends in:

```javascript
  expensesForPeriod(source, periodBounds('2026-10', 24));
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/logic.test.js`
Expected: FAIL — the new `periodBounds` expectations do not match the current return shape (`label`, `nextStartDate`, start-day-driven range), and `expensesBeforeAnchor` cannot be imported.

- [ ] **Step 3: Implement the model**

In `logic.js`, add `nextDay` next to `previousDate`:

```javascript
function nextDay(dateKey) {
  const { year, month, day } = parseDateKey(dateKey);
  if (day < daysInMonth(year, month)) return `${year}-${String(month).padStart(2, '0')}-${String(day + 1).padStart(2, '0')}`;
  const next = parsePeriodKey(monthKey(year, month + 1));
  return `${next.year}-${String(next.month).padStart(2, '0')}-01`;
}
```

Replace `periodBounds` entirely. `startDateForPeriod(periodKey, endDay)` already computes `periodKey-min(endDay, daysInMonth)`, so it is reused as the end boundary:

```javascript
export function periodBounds(periodKey, endDay, anchor = null) {
  if (!Number.isInteger(endDay) || endDay < 1 || endDay > 31) {
    throw new TypeError('endDay must be an integer from 1 through 31');
  }
  const endDate = startDateForPeriod(periodKey, endDay);
  const chainStartDate = nextDay(startDateForPeriod(shiftPeriodKey(periodKey, -1), endDay));
  const startDate = anchor !== null && anchor !== '' && chainStartDate < anchor && anchor <= endDate ? anchor : chainStartDate;
  return { key: periodKey, startDate, endDate, rangeLabel: `${shortDate(startDate)}–${shortDate(endDate)}` };
}
```

Replace `periodKeyForDate`:

```javascript
export function periodKeyForDate(dateKey, endDay) {
  if (!Number.isInteger(endDay) || endDay < 1 || endDay > 31) {
    throw new TypeError('endDay must be an integer from 1 through 31');
  }
  const { year, month } = parseDateKey(dateKey);
  const candidate = monthKey(year, month);
  return dateKey > startDateForPeriod(candidate, endDay) ? shiftPeriodKey(candidate, 1) : candidate;
}
```

Add the shared comparator and replace `expensesForPeriod`, then add `expensesBeforeAnchor`:

```javascript
function newestFirst(left, right) {
  return right.date.localeCompare(left.date) || right.id.localeCompare(left.id);
}

export function expensesForPeriod(expenses, bounds, categoryId = 'all') {
  return expenses
    .filter(expense => expense.date >= bounds.startDate && expense.date <= bounds.endDate)
    .filter(expense => categoryId === 'all' || expense.catId === categoryId)
    .toSorted(newestFirst);
}

export function expensesBeforeAnchor(expenses, anchor, categoryId = 'all') {
  if (!anchor) return [];
  return expenses
    .filter(expense => expense.date < anchor)
    .filter(expense => categoryId === 'all' || expense.catId === categoryId)
    .toSorted(newestFirst);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/logic.test.js && npm test`
Expected: PASS. `tests/storage.test.js` and `tests/static.test.js` are untouched by this task and must still pass.

- [ ] **Step 5: Commit**

```bash
git add logic.js tests/logic.test.js
git commit -m "feat: end-day-driven periods with an optional start anchor"
```

---

### Task 2: Storage keys and the one-time migration

**Files:**
- Modify: `storage.js`
- Test: `tests/storage.test.js`

**Interfaces:**
- Consumes: `shiftPeriodKey`, `isValidDateKey`, `isValidPeriodKey` from `logic.js`.
- Produces:
  - `state.cycleEndDay: number` (1–31, default 31), `state.anchor: string | null` (default `null`).
  - `repository.saveCycleEndDay(day)`, `repository.saveAnchor(dateKeyOrNull)`; `saveCycleStartDay` is gone.
  - The legacy key `silo_cycle_start_day` is consumed and removed exactly once.

- [ ] **Step 1: Write the failing tests**

In `tests/storage.test.js`, inside `fresh load creates the complete Silo 2.0 state` replace the `cycleStartDay` assertion with:

```javascript
  assert.equal(result.state.cycleEndDay, 31);
  assert.equal(result.state.anchor, null);
```

Replace the `invalid theme and start day safely fall back` test with:

```javascript
test('invalid theme and end day safely fall back', () => {
  const result = createRepository(memoryStorage({ silo_theme: 'neon', silo_cycle_start_day: '99' })).load();
  assert.equal(result.state.theme, 'system');
  assert.equal(result.state.cycleEndDay, 31);
});
```

Add these tests:

```javascript
test('legacy start day migrates to an end day and shifts income keys once', () => {
  const storage = memoryStorage({
    silo_cycle_start_day: '25',
    silo_period_incomes: JSON.stringify({ '2026-09': 5_000_000, '2026-10': 6_000_000 }),
  });
  const first = createRepository(storage).load();
  assert.equal(first.ok, true);
  assert.equal(first.state.cycleEndDay, 24);
  assert.equal(first.state.anchor, null);
  assert.deepEqual(first.state.periodIncomes, { '2026-10': 5_000_000, '2026-11': 6_000_000 });
  assert.equal(storage.getItem('silo_cycle_start_day'), null);
  assert.equal(storage.getItem('silo_cycle_end_day'), '24');

  const second = createRepository(storage).load();
  assert.deepEqual(second.state.periodIncomes, { '2026-10': 5_000_000, '2026-11': 6_000_000 });
  assert.equal(second.state.cycleEndDay, 24);
});

test('legacy start day 1 becomes end day 31 without touching income keys', () => {
  const storage = memoryStorage({ silo_cycle_start_day: '1', silo_period_incomes: JSON.stringify({ '2026-09': 5_000_000 }) });
  const result = createRepository(storage).load();
  assert.equal(result.state.cycleEndDay, 31);
  assert.deepEqual(result.state.periodIncomes, { '2026-09': 5_000_000 });
  assert.equal(storage.getItem('silo_cycle_start_day'), null);
});

test('a failed migration keeps the legacy key and leaves incomes unshifted', () => {
  const base = memoryStorage({ silo_cycle_start_day: '25', silo_period_incomes: JSON.stringify({ '2026-09': 5_000_000 }) });
  const failing = { ...base, setItem(key, value) { if (key === 'silo_period_incomes') throw new Error('disk full'); base.setItem(key, value); } };
  const result = createRepository(failing).load();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'STORAGE_WRITE_FAILED');
  assert.equal(base.getItem('silo_cycle_start_day'), '25');
  assert.deepEqual(JSON.parse(base.getItem('silo_period_incomes')), { '2026-09': 5_000_000 });
  assert.notEqual(base.getItem('silo_pending_transaction'), null);

  const recovered = createRepository(base).load();
  assert.equal(recovered.ok, true);
  assert.deepEqual(recovered.state.periodIncomes, { '2026-10': 5_000_000 });
});

test('a half-finished migration recovers and retries cleanly', () => {
  const base = memoryStorage({ silo_cycle_start_day: '25', silo_period_incomes: JSON.stringify({ '2026-09': 5_000_000 }) });
  let failures = 1;
  const flaky = {
    ...base,
    setItem(key, value) {
      if (failures > 0 && key === 'silo_cycle_end_day') { failures -= 1; throw new Error('disk full'); }
      base.setItem(key, value);
    },
  };
  assert.equal(createRepository(flaky).load().ok, false);
  const recovered = createRepository(base).load();
  assert.equal(recovered.ok, true);
  assert.equal(recovered.state.cycleEndDay, 24);
  assert.deepEqual(recovered.state.periodIncomes, { '2026-10': 5_000_000 });
});

test('end day and anchor persist and round-trip', () => {
  const storage = memoryStorage();
  const repository = createRepository(storage);
  repository.load();
  repository.saveCycleEndDay(10);
  repository.saveAnchor('2026-09-21');
  const reloaded = createRepository(storage).load();
  assert.equal(reloaded.state.cycleEndDay, 10);
  assert.equal(reloaded.state.anchor, '2026-09-21');
  assert.throws(() => repository.saveCycleEndDay(32), /1 through 31/);
  assert.throws(() => repository.saveAnchor('21/09/2026'), /Invalid anchor/);
});
```

The pending record is deliberately left behind when a migration write fails — it is the marker the next load uses to undo the half-written migration. Asserting it is `null` would contradict the implementation; asserting it is present, then asserting a fresh load recovers, is the real contract.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/storage.test.js`
Expected: FAIL — `state.cycleEndDay` is `undefined` and `saveCycleEndDay`/`saveAnchor` do not exist.

- [ ] **Step 3: Implement the keys, migration and recovery**

In `storage.js`, extend the import and replace the key constants:

```javascript
import { isValidDateKey, isValidPeriodKey, shiftPeriodKey } from './logic.js';

const KEYS = Object.freeze({
  expenses: 'silo_expenses', categories: 'silo_categories', incomes: 'silo_period_incomes',
  endDay: 'silo_cycle_end_day', anchor: 'silo_cycle_anchor', theme: 'silo_theme',
  lastCategory: 'silo_last_category', transaction: 'silo_pending_transaction',
});
const LEGACY_START_DAY = 'silo_cycle_start_day';
const MAX_DAY = 31;
```

In `recoverPendingTransaction`, handle the cycle record before the existing `delete-category` validation. It undoes a half-finished migration: restore the incomes, drop the end day (which did not exist before the migration), clear the record. The legacy key stays, so the next load retries from a clean state:

```javascript
  if (pending && pending.type === 'migrate-cycle') {
    if (!Object.hasOwn(pending, 'incomesBefore')) return { ok: false, code: 'MALFORMED_DATA', key: KEYS.transaction };
    try { restoreRaw(storage, KEYS.incomes, pending.incomesBefore); storage.removeItem(KEYS.endDay); storage.removeItem(KEYS.transaction); return { ok: true }; }
    catch (cause) { throw storageError(cause); }
  }
```

Add the migration inside `createRepository`, next to `requireLoaded`:

```javascript
  function migrateCycleSettings(incomes) {
    const legacy = storage.getItem(LEGACY_START_DAY);
    if (legacy === null) return { ok: true, incomes };
    const startDay = Number(legacy);
    if (!Number.isInteger(startDay) || startDay < 1 || startDay > MAX_DAY) { storage.removeItem(LEGACY_START_DAY); return { ok: true, incomes }; }
    const endDay = startDay === 1 ? MAX_DAY : startDay - 1;
    let next = incomes;
    try {
      write(KEYS.transaction, { type: 'migrate-cycle', startDay, incomesBefore: storage.getItem(KEYS.incomes) });
      if (startDay >= 2) {
        next = Object.fromEntries(Object.entries(incomes).map(([key, amount]) => [shiftPeriodKey(key, 1), amount]));
        write(KEYS.incomes, next);
      }
      write(KEYS.endDay, String(endDay));
      storage.removeItem(KEYS.transaction);
      storage.removeItem(LEGACY_START_DAY);
    } catch (cause) {
      return { ok: false, code: 'STORAGE_WRITE_FAILED', key: KEYS.transaction };
    }
    return { ok: true, incomes: next };
  }
```

The pending record is what makes this idempotent: incomes are written before the end day, so a crash between the two writes would otherwise shift them twice on the next load. The legacy key is deleted only after every write succeeded.

In `load()`, run the migration after the three validations and before building `current`:

```javascript
    const cycle = migrateCycleSettings(incomesResult.value);
    if (!cycle.ok) return cycle;
    const rawEndDay = storage.getItem(KEYS.endDay);
    const endDay = rawEndDay === null ? MAX_DAY : Number(rawEndDay);
    const anchor = storage.getItem(KEYS.anchor);
    current = { expenses: structuredClone(expensesResult.value), categories: migrateCategories(categoriesResult.value), periodIncomes: cycle.incomes, cycleEndDay: Number.isInteger(endDay) && endDay >= 1 && endDay <= MAX_DAY ? endDay : MAX_DAY, anchor: isValidDateKey(anchor) ? anchor : null, theme: THEMES.has(storage.getItem(KEYS.theme)) ? storage.getItem(KEYS.theme) : 'system', lastCategory: storage.getItem(KEYS.lastCategory) || 'food' };
```

Replace `saveCycleStartDay` with the two writers:

```javascript
  function saveCycleEndDay(day) { requireLoaded(); if (!Number.isInteger(day) || day < 1 || day > MAX_DAY) throw new TypeError('End day must be 1 through 31'); write(KEYS.endDay, String(day)); current.cycleEndDay = day; }
  function saveAnchor(dateKey) { requireLoaded(); if (dateKey !== null && !isValidDateKey(dateKey)) throw new TypeError('Invalid anchor'); if (dateKey === null) storage.removeItem(KEYS.anchor); else write(KEYS.anchor, dateKey); current.anchor = dateKey; }
```

and in the returned object replace `saveCycleStartDay` with `saveCycleEndDay, saveAnchor`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/storage.test.js && npm test`
Expected: PASS, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add storage.js tests/storage.test.js
git commit -m "feat: persist end day and anchor with a fail-closed cycle migration"
```

---

### Task 3: Settings sheet, live preview and period title

**Files:**
- Modify: `index.html`, `app.js`, `styles.css`
- Test: `tests/static.test.js`

**Interfaces:**
- Consumes: `periodBounds`, `periodKeyForDate`, `expensesBeforeAnchor`, `isValidDateKey`, `shiftPeriodKey` from `logic.js`; `repository.saveCycleEndDay`, `repository.saveAnchor` from Task 2.
- Produces: elements `#cycleEndDay`, `#cycleEndDayError`, `#cycleAnchor`, `#cycleAnchorError`, `#periodPreview`, `#periodRange`, `#periodEndDay`; functions `updatePeriodPreview()`, `saveCycleSettings(event)`; `saveCycleStartDay` and `cycleStartDay` are gone from `app.js`.

- [ ] **Step 1: Write the failing source assertions**

Add to `tests/static.test.js`:

```javascript
test('period settings expose an end day, an anchor and a live preview', () => {
  assert.match(index, /id="cycleEndDay"[^>]*inputmode="numeric"/);
  assert.match(index, /id="cycleAnchor"[^>]*type="date"/);
  assert.match(index, /id="periodPreview"[^>]*aria-live="polite"/);
  assert.doesNotMatch(appSource, /cycleStartDay/);
  assert.match(appSource, /periodBounds\(state\.selectedPeriodKey, state\.cycleEndDay, state\.anchor\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/static.test.js`
Expected: FAIL — `index.html` still has `id="cycleStartDay"` and `app.js` still references `cycleStartDay`.

- [ ] **Step 3: Update `index.html`**

Inside `#periodPicker`, replace the `#periodLabel` / `#periodRange` pair with (the existing `.period-title strong` / `.period-title span` rules style both, so no CSS change is needed for them):

```html
<strong id="periodRange">—</strong><span id="periodEndDay">Kết thúc ngày —</span>
```

Replace the whole `<form id="periodSettingsForm">` element:

```html
<form id="periodSettingsForm"><header><h2 id="periodSettingsTitle">Cài đặt kỳ</h2><button type="button" data-close="periodSettingsSheet" aria-label="Đóng">×</button></header><label for="cycleEndDay">Kết thúc kỳ — ngày</label><input id="cycleEndDay" type="number" inputmode="numeric" min="1" max="31"><p id="cycleEndDayError" class="field-error" role="alert"></p><label for="cycleAnchor">Kỳ đầu tiên bắt đầu</label><input id="cycleAnchor" type="date"><p id="cycleAnchorError" class="field-error" role="alert"></p><p id="periodPreview" class="period-preview" aria-live="polite"></p><button class="primary-button" type="submit">Lưu kỳ</button></form>
```

- [ ] **Step 4: Update `app.js`**

Add `expensesBeforeAnchor` to the `logic.js` import at the top (Task 4 uses it; adding it now keeps each commit's file state consistent):

```javascript
import { appendTripleZero, calculatePeriodSummary, expensesBeforeAnchor, expensesForPeriod, formatMoneyInput, formatVnd, isValidDateKey, isValidPeriodKey, parsePositiveAmount, periodBounds, periodKeyForDate, shiftPeriodKey, swipeTarget } from './logic.js';
```

Replace `selectedBounds`:

```javascript
function selectedBounds() { return periodBounds(state.selectedPeriodKey, state.cycleEndDay, state.anchor); }
```

Inside `render()`, replace the two label assignments with:

```javascript
  $('#periodRange').textContent = bounds.rangeLabel; $('#periodEndDay').textContent = `Kết thúc ngày ${state.cycleEndDay}`; $('#previousPeriod').disabled = state.anchor !== null && bounds.startDate === state.anchor;
```

Add the preview function next to `openIncomeEditor`:

```javascript
function updatePeriodPreview() {
  const day = Number($('#cycleEndDay').value);
  const anchor = $('#cycleAnchor').value || null;
  const preview = $('#periodPreview');
  if (!Number.isInteger(day) || day < 1 || day > 31) { preview.textContent = ''; return; }
  const current = periodBounds(state.selectedPeriodKey, day, anchor);
  const next = periodBounds(shiftPeriodKey(state.selectedPeriodKey, 1), day, anchor);
  preview.textContent = `Kỳ này: ${current.rangeLabel} · Kỳ sau: ${next.rangeLabel}`;
}
```

Replace `saveCycleStartDay` with `saveCycleSettings`:

```javascript
function saveCycleSettings(event) {
  event.preventDefault(); const day = Number($('#cycleEndDay').value); const anchor = $('#cycleAnchor').value || null;
  if (!Number.isInteger(day) || day < 1 || day > 31) { $('#cycleEndDayError').textContent = 'Ngày kết thúc từ 1 đến 31.'; return; }
  if (anchor !== null && !isValidDateKey(anchor)) { $('#cycleAnchorError').textContent = 'Ngày bắt đầu không hợp lệ.'; return; }
  const finish = () => {
    try {
      repository.saveCycleEndDay(day); repository.saveAnchor(anchor);
      state.cycleEndDay = day; state.anchor = anchor;
      state.selectedPeriodKey = anchor !== null && todayKey() < anchor ? periodKeyForDate(anchor, day) : periodKeyForDate(todayKey(), day);
      state.selectedCategoryId = 'all'; $('#periodSettingsSheet').close(); render(); announce('Đã lưu kỳ chi tiêu');
    } catch { reportStorageError(); }
  };
  if (day === state.cycleEndDay && anchor === state.anchor) { finish(); return; }
  const before = expensesBeforeAnchor(state.expenses, anchor).length;
  const message = before > 0
    ? `Có ${before} khoản chi nằm trước kỳ đầu và sẽ không thuộc kỳ nào. Tiếp tục?`
    : 'Các khoản chi cũ sẽ được nhóm lại theo kỳ mới nhưng không bị xóa. Tiếp tục?';
  confirmAction(message, 'Đổi kỳ').then(ok => { if (ok) finish(); });
}
```

Update the wiring inside the `else` block — replace the `#periodPicker` and `#periodSettingsForm` listeners with:

```javascript
  $('#periodPicker').addEventListener('click', () => { $('#cycleEndDay').value = state.cycleEndDay; $('#cycleAnchor').value = state.anchor ?? ''; $('#cycleEndDayError').textContent = ''; $('#cycleAnchorError').textContent = ''; updatePeriodPreview(); $('#periodSettingsSheet').showModal(); });
  $('#periodSettingsForm').addEventListener('submit', saveCycleSettings); $('#periodSettingsForm').addEventListener('input', updatePeriodPreview);
```

- [ ] **Step 5: Add the preview style to `styles.css`**

```css
.period-preview{margin:10px 0 0;color:var(--muted);font-size:.85rem;font-variant-numeric:tabular-nums}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/static.test.js && npm test`
Expected: PASS, 0 failing. The `doesNotMatch(appSource, /cycleStartDay/)` assertion is what proves the rename is complete.

- [ ] **Step 7: Commit**

```bash
git add index.html app.js styles.css tests/static.test.js
git commit -m "feat: choose the period end day and start anchor in settings"
```

---

### Task 4: Pre-anchor expenses, release bump and product contract

**Files:**
- Modify: `app.js`, `styles.css`, `sw.js`, `PRODUCT.md`
- Test: `tests/static.test.js`

**Interfaces:**
- Consumes: `expensesBeforeAnchor` from Task 1.
- Produces: internal `expenseRow(expense) → HTMLElement`; a `<details class="before-anchor">` block when pre-anchor expenses exist; `CACHE_NAME = 'silo-v4-period-end-day'`.

- [ ] **Step 1: Write the failing source assertions**

Add to `tests/static.test.js`:

```javascript
test('expenses before the anchor stay reachable and their styles exist', () => {
  assert.match(appSource, /function expenseRow\s*\(/);
  assert.match(appSource, /expensesBeforeAnchor\(state\.expenses, state\.anchor/);
  assert.match(appSource, /'before-anchor'/);
  assert.match(styles, /\.before-anchor\{/);
});
```

The last two assertions pair a class name across both files; a typo in either is exactly the mistake they catch.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/static.test.js`
Expected: FAIL — `expenseRow` and `expensesBeforeAnchor` do not appear in `app.js` yet.

- [ ] **Step 3: Extract the row builder and add the section**

In `app.js`, add `expenseRow` above `renderExpenseList`. This is the existing inline markup lifted out unchanged:

```javascript
function expenseRow(expense) {
  const category = state.categories.find(item => item.id === expense.catId) ?? state.categories.find(item => item.id === 'other');
  const row = document.createElement('article'); row.className = 'expense-row';
  const icon = document.createElement('span'); icon.className = 'expense-icon'; icon.textContent = category?.emoji ?? '📌';
  const copy = document.createElement('div'); copy.className = 'expense-copy';
  const title = document.createElement('div'); title.className = 'expense-title'; title.textContent = expense.title;
  const cat = document.createElement('div'); cat.className = 'expense-category'; cat.textContent = category?.name ?? 'Khác';
  copy.append(title, cat);
  const amount = document.createElement('strong'); amount.className = 'expense-amount'; amount.textContent = formatVnd(expense.amount);
  const track = document.createElement('div'); track.className = 'expense-track'; track.append(icon, copy, amount); row.append(track);
  const actions = document.createElement('div'); actions.className = 'expense-actions';
  const edit = makeButton('Sửa', 'expense-edit'); edit.setAttribute('aria-label', `Sửa ${expense.title}`); edit.addEventListener('click', () => openExpenseEditor(expense.id));
  const remove = makeButton('Xóa', 'expense-delete'); remove.setAttribute('aria-label', `Xóa ${expense.title}`); remove.addEventListener('click', () => deleteExpense(expense.id));
  actions.append(edit, remove); row.append(actions);
  return row;
}
```

Rewrite `renderExpenseList` to use it and append the section. The empty state must no longer return early, otherwise the pre-anchor section would be hidden:

```javascript
function renderExpenseList() {
  closeSwipe(); const list = $('#expenseList'); list.replaceChildren(); const expenses = selectedExpenses();
  if (!expenses.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state';
    empty.textContent = state.selectedCategoryId === 'all' ? 'Chưa có khoản chi trong kỳ này.' : 'Danh mục này chưa có khoản chi.';
    list.append(empty);
  } else {
    const groups = new Map(); expenses.forEach(expense => { if (!groups.has(expense.date)) groups.set(expense.date, []); groups.get(expense.date).push(expense); });
    for (const [date, items] of groups) {
      const section = document.createElement('section'); section.className = 'date-group';
      const heading = document.createElement('h3'); heading.className = 'date-heading'; heading.textContent = date.split('-').reverse().join('/');
      section.append(heading);
      items.forEach(expense => section.append(expenseRow(expense)));
      list.append(section);
    }
  }
  const before = expensesBeforeAnchor(state.expenses, state.anchor, state.selectedCategoryId);
  if (before.length) {
    const details = document.createElement('details'); details.className = 'before-anchor';
    const summary = document.createElement('summary'); summary.textContent = `Trước kỳ đầu (${before.length})`;
    details.append(summary);
    before.forEach(expense => details.append(expenseRow(expense)));
    list.append(details);
  }
}
```

- [ ] **Step 4: Style the section, bump the cache, update the contract**

Append to `styles.css`:

```css
.before-anchor{margin-top:22px}.before-anchor>summary{padding:6px 0;color:var(--muted);font-size:.85rem;font-weight:750;cursor:pointer}
```

Bump the cache in `sw.js` so installed PWAs pick the release up:

```javascript
const CACHE_NAME = 'silo-v4-period-end-day';
```

In `PRODUCT.md`, replace the operating-context bullet that says the owner chooses the recurring period-start day:

```markdown
- The owner chooses the recurring day of month on which a spending period ends, and optionally the
  date on which the first period begins. Periods run contiguously; the start day is not recurring.
```

and in Capabilities and Constraints replace the matching capability bullet:

```markdown
- The owner selects a recurring period-end day from 1 through 31, and optionally the date the first
  period starts. Expenses dated before that anchor are listed under `Trước kỳ đầu` so they stay
  editable.
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, 0 failing.

- [ ] **Step 6: Commit**

```bash
git add app.js styles.css sw.js PRODUCT.md tests/static.test.js
git commit -m "feat: surface pre-anchor expenses and release the period model"
```

- [ ] **Step 7: Hand the manual check to the owner**

The suite cannot exercise rendering or touch, and this repo deliberately has no DOM harness. After pushing, ask the owner to confirm on the iPhone:

1. Settings shows `Kết thúc kỳ — ngày` and `Kỳ đầu tiên bắt đầu`, and the preview reads `Kỳ này: … · Kỳ sau: …`.
2. With end day 10 and anchor 21/09/2026 the period title shows `21/09–10/10`, and `›` moves to `11/10–10/11`.
3. `‹` is disabled on the first period.
4. Income entered before the migration still appears in the period it belongs to.
5. An expense dated before the anchor appears under `Trước kỳ đầu (N)` and can still be edited and deleted by swiping.

---

## Self-review notes

- **Spec coverage:** model and invariants → Task 1; date resolution, inclusive period filter, pre-anchor filter → Task 1; storage keys, one-time migration, fail-closed and idempotent behaviour, `anchor` default unset → Task 2; two settings, live preview, range title, `‹` disabled, validation copy, confirm copy → Task 3; `Trước kỳ đầu` section, category filter, cache bump, `PRODUCT.md` → Task 4. The spec's measured legacy deviation for start days 29–31 needs no code and is documented there.
- **Every commit keeps the suite green.** The three tests that Task 1's signature change would otherwise break (`periodKeyForDate`, the inclusive-range filter, and the no-mutation test's `periodBounds` call) are all updated inside Task 1 rather than deferred.
- **Not covered by automated tests:** the pre-anchor section's swipe actions reuse `expenseRow`, so they work by construction, but only the owner can confirm on the device (Task 4 step 7).
