# Silo 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing Silo GitHub Pages PWA into a local-first iPhone spending-period tracker with manually entered income, configurable period start day, fast VND entry, adaptive themes, improved categories, and safe offline behavior.

**Architecture:** Keep Silo as a static, dependency-free HTML/CSS/JavaScript PWA. Extract pure period and money calculations into `logic.js`, isolate validation and `localStorage` migration in `storage.js`, and let `app.js` own DOM state and interactions. Existing data keys remain readable, financial data never leaves the device, and the service worker caches only application-shell files.

**Tech Stack:** Semantic HTML5, modern CSS, browser-native ES modules, `localStorage`, Service Worker, Web App Manifest, Node.js built-in `node:test`, GitHub Pages.

## Global Constraints

- Repository root: `/Users/vuhaianh/silo-myassitant`.
- Design authority: `docs/superpowers/specs/2026-09-03-silo-v2-design.md`.
- Product authority: `PRODUCT.md`.
- Primary target: iPhone Home Screen PWA; support viewport widths from 320 CSS pixels upward.
- Verify explicitly at 375, 390, and 430 CSS-pixel widths.
- Interface language is Vietnamese and all money is positive integer VND.
- Period income and every expense are entered manually.
- Period start day is a global integer from 1 through 31; default is 1.
- A period is named from its start and end calendar months, for example `Kỳ tháng 9–10`.
- No carry-over, bank integration, server, login, sync, analytics, export, backup, restore, or App Store work.
- Preserve every valid existing expense and custom category.
- Keep GitHub Pages URLs and all asset references relative.
- No React, Vue, Svelte, TypeScript conversion, CSS framework, state library, database wrapper, bundler, or runtime dependency.
- Do not interpolate owner-entered values into `innerHTML`; use DOM APIs and `textContent`.
- Minimum interactive target is 44 by 44 CSS pixels.
- Theme options are `system`, `light`, and `dark`; `system` is default.
- `Tiết kiệm` and `Đầu tư` are expense categories and reduce the current period's remaining amount.
- All tasks follow red-green-refactor, run the complete test suite before commit, and leave the app usable at task boundaries.

## Planned File Map

| File | Action | Responsibility |
|---|---|---|
| `package.json` | Create | Declare ES-module mode and dependency-free test command. |
| `logic.js` | Create | Pure date-period, money-input, filtering, summary, and label functions. |
| `storage.js` | Create | Storage keys, validation, migration, durable writes, and category deletion transaction. |
| `app.js` | Create | Application state, rendering, event handling, sheet lifecycle, focus, and service-worker update UI. |
| `styles.css` | Create | Light/dark tokens, mobile layout, components, safe areas, large text, and reduced motion. |
| `index.html` | Replace | Semantic PWA shell, dialogs/sheets, forms, live regions, and module entry point. |
| `sw.js` | Replace | Versioned application-shell cache, navigation fallback, and controlled activation. |
| `manifest.json` | Modify | Light-first install colors and stable relative start URL. |
| `tests/logic.test.js` | Create | Pure calculation and amount-entry tests. |
| `tests/storage.test.js` | Create | Validation, migration, malformed data, and transactional deletion tests. |
| `tests/static.test.js` | Create | Static security, accessibility, and PWA wiring checks. |
| `README.md` | Replace | Local development, testing, iPhone installation, upgrade, privacy, and deployment instructions. |

---

### Task 1: Add the dependency-free test runner and pure period/money logic

**Files:**

- Create: `package.json`
- Create: `logic.js`
- Create: `tests/logic.test.js`

**Interfaces:**

- Consumes: no application interfaces.
- Produces:
  - `periodBounds(periodKey: string, startDay: number): PeriodBounds`
  - `periodKeyForDate(dateKey: string, startDay: number): string`
  - `shiftPeriodKey(periodKey: string, delta: number): string`
  - `expensesForPeriod(expenses: Expense[], bounds: PeriodBounds, categoryId?: string): Expense[]`
  - `calculatePeriodSummary(income: number | null, expenses: Expense[]): PeriodSummary`
  - `normalizeMoneyDigits(value: unknown): string`
  - `appendTripleZero(value: unknown): string`
  - `parsePositiveAmount(value: unknown): number | null`
  - `formatMoneyInput(value: unknown): string`
  - `formatVnd(value: number): string`
  - `isValidDateKey(value: unknown): boolean`

- [ ] **Step 1: Confirm the execution baseline**

Run:

```bash
cd /Users/vuhaianh/silo-myassitant
git status --short
git log -1 --oneline
node --version
```

Expected: clean status, latest commit includes the approved Silo 2.0 specification, and Node.js is available. If the status is not clean, stop and preserve the owner's changes before continuing.

- [ ] **Step 2: Create the test command**

Create `package.json` exactly as the dependency-free runner:

```json
{
  "name": "silo-myassitant",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.js"
  }
}
```

- [ ] **Step 3: Write failing period and money tests**

Create `tests/logic.test.js` with explicit boundaries and labels:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendTripleZero,
  calculatePeriodSummary,
  expensesForPeriod,
  formatMoneyInput,
  formatVnd,
  isValidDateKey,
  normalizeMoneyDigits,
  parsePositiveAmount,
  periodBounds,
  periodKeyForDate,
  shiftPeriodKey,
} from '../logic.js';

test('period starting on day 1 stays inside one month', () => {
  assert.deepEqual(periodBounds('2026-09', 1), {
    key: '2026-09',
    startDate: '2026-09-01',
    nextStartDate: '2026-10-01',
    endDate: '2026-09-30',
    label: 'Kỳ tháng 9',
    rangeLabel: '01/09–30/09',
  });
});

test('period starting on day 25 crosses two months', () => {
  assert.deepEqual(periodBounds('2026-09', 25), {
    key: '2026-09',
    startDate: '2026-09-25',
    nextStartDate: '2026-10-25',
    endDate: '2026-10-24',
    label: 'Kỳ tháng 9–10',
    rangeLabel: '25/09–24/10',
  });
});

test('period day 31 clamps to the last day and remains contiguous', () => {
  assert.deepEqual(periodBounds('2027-01', 31), {
    key: '2027-01',
    startDate: '2027-01-31',
    nextStartDate: '2027-02-28',
    endDate: '2027-02-27',
    label: 'Kỳ tháng 1–2',
    rangeLabel: '31/01–27/02',
  });
  assert.equal(periodBounds('2027-02', 31).startDate, '2027-02-28');
  assert.equal(periodBounds('2028-02', 31).startDate, '2028-02-29');
});

test('cross-year label includes both years', () => {
  assert.equal(periodBounds('2026-12', 25).label, 'Kỳ tháng 12/2026–1/2027');
});

test('date resolves to the period that most recently started', () => {
  assert.equal(periodKeyForDate('2026-09-24', 25), '2026-08');
  assert.equal(periodKeyForDate('2026-09-25', 25), '2026-09');
  assert.equal(periodKeyForDate('2026-10-24', 25), '2026-09');
  assert.equal(periodKeyForDate('2026-10-25', 25), '2026-10');
});

test('period keys shift without Date timezone conversion', () => {
  assert.equal(shiftPeriodKey('2026-01', -1), '2025-12');
  assert.equal(shiftPeriodKey('2026-12', 1), '2027-01');
});

test('date validation rejects impossible calendar dates', () => {
  assert.equal(isValidDateKey('2028-02-29'), true);
  assert.equal(isValidDateKey('2027-02-29'), false);
  assert.equal(isValidDateKey('2026-13-01'), false);
});

test('period filter uses inclusive start and exclusive next start', () => {
  const expenses = [
    { id: 'a', title: 'A', amount: 10, date: '2026-09-24', catId: 'food' },
    { id: 'b', title: 'B', amount: 20, date: '2026-09-25', catId: 'food' },
    { id: 'c', title: 'C', amount: 30, date: '2026-10-24', catId: 'saving' },
    { id: 'd', title: 'D', amount: 40, date: '2026-10-25', catId: 'food' },
  ];
  const bounds = periodBounds('2026-09', 25);
  assert.deepEqual(expensesForPeriod(expenses, bounds).map(item => item.id), ['c', 'b']);
  assert.deepEqual(expensesForPeriod(expenses, bounds, 'food').map(item => item.id), ['b']);
});

test('summary distinguishes missing income and exceeded income', () => {
  const expenses = [{ amount: 1_250_000 }, { amount: 4_000_000 }];
  assert.deepEqual(calculatePeriodSummary(null, expenses), {
    income: null,
    spent: 5_250_000,
    remaining: null,
    percentageUsed: null,
    status: 'missing',
  });
  assert.deepEqual(calculatePeriodSummary(5_000_000, expenses), {
    income: 5_000_000,
    spent: 5_250_000,
    remaining: -250_000,
    percentageUsed: 105,
    status: 'exceeded',
  });
});

test('money input strips non-digits, formats VND, and appends 000', () => {
  assert.equal(normalizeMoneyDigits(' 5.000 ₫ '), '5000');
  assert.equal(normalizeMoneyDigits('00050'), '50');
  assert.equal(formatMoneyInput('5000000'), '5.000.000');
  assert.equal(formatVnd(5_000_000), '5.000.000 ₫');
  assert.equal(appendTripleZero(''), '');
  assert.equal(appendTripleZero('0'), '');
  assert.equal(appendTripleZero('5'), '5000');
  assert.equal(appendTripleZero('50.000'), '50000000');
  assert.equal(parsePositiveAmount('5.000.000'), 5_000_000);
  assert.equal(parsePositiveAmount('0'), null);
  assert.equal(parsePositiveAmount('-2'), 2);
});
```

- [ ] **Step 4: Run the tests and verify red**

Run:

```bash
npm test
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `logic.js`.

- [ ] **Step 5: Implement the pure domain module**

Create `logic.js`. Keep all calendar math in local date strings and do not parse expense dates through `new Date('YYYY-MM-DD')`:

```js
const VND = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

function parsePeriodKey(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new TypeError(`Invalid period key: ${key}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new TypeError(`Invalid period key: ${key}`);
  return { year, month };
}

function parseDateKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new TypeError(`Invalid date key: ${key}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new TypeError(`Invalid date key: ${key}`);
  }
  return { year, month, day };
}

export function isValidDateKey(value) {
  try {
    parseDateKey(value);
    return true;
  } catch {
    return false;
  }
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function monthKey(year, month) {
  const index = year * 12 + (month - 1);
  const normalizedYear = Math.floor(index / 12);
  const normalizedMonth = ((index % 12) + 12) % 12 + 1;
  return `${normalizedYear}-${String(normalizedMonth).padStart(2, '0')}`;
}

function startDateForPeriod(periodKey, startDay) {
  const { year, month } = parsePeriodKey(periodKey);
  const day = Math.min(startDay, daysInMonth(year, month));
  return `${periodKey}-${String(day).padStart(2, '0')}`;
}

function previousDate(dateKey) {
  const { year, month, day } = parseDateKey(dateKey);
  if (day > 1) return `${year}-${String(month).padStart(2, '0')}-${String(day - 1).padStart(2, '0')}`;
  const previous = parsePeriodKey(monthKey(year, month - 1));
  const previousDay = daysInMonth(previous.year, previous.month);
  return `${previous.year}-${String(previous.month).padStart(2, '0')}-${previousDay}`;
}

function shortDate(dateKey) {
  const { month, day } = parseDateKey(dateKey);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

export function shiftPeriodKey(periodKey, delta) {
  const { year, month } = parsePeriodKey(periodKey);
  return monthKey(year, month + delta);
}

export function periodBounds(periodKey, startDay) {
  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 31) {
    throw new TypeError('startDay must be an integer from 1 through 31');
  }
  const startDate = startDateForPeriod(periodKey, startDay);
  const nextKey = shiftPeriodKey(periodKey, 1);
  const nextStartDate = startDateForPeriod(nextKey, startDay);
  const endDate = previousDate(nextStartDate);
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  let label = `Kỳ tháng ${start.month}`;
  if (start.month !== end.month || start.year !== end.year) {
    label = start.year === end.year
      ? `Kỳ tháng ${start.month}–${end.month}`
      : `Kỳ tháng ${start.month}/${start.year}–${end.month}/${end.year}`;
  }
  return {
    key: periodKey,
    startDate,
    nextStartDate,
    endDate,
    label,
    rangeLabel: `${shortDate(startDate)}–${shortDate(endDate)}`,
  };
}

export function periodKeyForDate(dateKey, startDay) {
  const { year, month } = parseDateKey(dateKey);
  const candidate = monthKey(year, month);
  return dateKey >= startDateForPeriod(candidate, startDay)
    ? candidate
    : shiftPeriodKey(candidate, -1);
}

export function expensesForPeriod(expenses, bounds, categoryId = 'all') {
  return expenses
    .filter(expense => expense.date >= bounds.startDate && expense.date < bounds.nextStartDate)
    .filter(expense => categoryId === 'all' || expense.catId === categoryId)
    .toSorted((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
}

export function calculatePeriodSummary(income, expenses) {
  const spent = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  if (income === null) {
    return { income: null, spent, remaining: null, percentageUsed: null, status: 'missing' };
  }
  const remaining = income - spent;
  const percentageUsed = income > 0 ? (spent / income) * 100 : null;
  const status = remaining < 0 ? 'exceeded' : percentageUsed >= 80 ? 'warning' : 'ok';
  return { income, spent, remaining, percentageUsed, status };
}

export function normalizeMoneyDigits(value) {
  const digits = String(value ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return digits === '0' ? '0' : digits;
}

export function appendTripleZero(value) {
  const digits = normalizeMoneyDigits(value);
  return /^[1-9]\d*$/.test(digits) ? `${digits}000` : '';
}

export function parsePositiveAmount(value) {
  const amount = Number(normalizeMoneyDigits(value));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function formatMoneyInput(value) {
  const digits = normalizeMoneyDigits(value);
  return digits ? VND.format(Number(digits)) : '';
}

export function formatVnd(value) {
  return `${VND.format(value)}\u00a0₫`;
}
```

- [ ] **Step 6: Run the targeted and complete tests**

Run:

```bash
node --test tests/logic.test.js
npm test
```

Expected: all tests PASS. If the installed Node version lacks `Array.prototype.toSorted`, replace only that call with `[...filtered].sort(...)` and keep the input array immutable.

- [ ] **Step 7: Commit the domain layer**

```bash
git add package.json logic.js tests/logic.test.js
git commit -m "feat: add spending period calculations"
```

---

### Task 2: Add guarded storage, validation, default categories, and idempotent migration

**Files:**

- Create: `storage.js`
- Create: `tests/storage.test.js`

**Interfaces:**

- Consumes: expense and category shapes defined in the approved design.
- Produces:
  - `DEFAULT_CATEGORIES: Category[]`
  - `createRepository(storage: StorageLike): Repository`
  - `Repository.load(): LoadResult`
  - `Repository.saveExpenses(expenses: Expense[]): void`
  - `Repository.saveCategories(categories: Category[]): void`
  - `Repository.savePeriodIncome(periodKey: string, amount: number): void`
  - `Repository.saveCycleStartDay(day: number): void`
  - `Repository.saveTheme(theme: Theme): void`
  - `Repository.saveLastCategory(categoryId: string): void`

- [ ] **Step 1: Write failing storage tests with an in-memory Storage implementation**

Create `tests/storage.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createRepository, DEFAULT_CATEGORIES } from '../storage.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    dump: () => Object.fromEntries(values),
  };
}

const oldCategories = [
  { id: 'food', name: 'Ăn uống', emoji: '🍜', color: '#f97316' },
  { id: 'bill', name: 'Hoá đơn', emoji: '📄', color: '#eab308' },
  { id: 'edu', name: 'Học tập', emoji: '📚', color: '#06b6d4' },
  { id: 'other', name: 'Khác', emoji: '📌', color: '#64748b' },
  { id: 'pet', name: 'Thú cưng', emoji: '🐶', color: '#795548' },
];

test('fresh load creates the complete Silo 2.0 state', () => {
  const result = createRepository(memoryStorage()).load();
  assert.equal(result.ok, true);
  assert.equal(result.state.cycleStartDay, 1);
  assert.equal(result.state.theme, 'system');
  assert.equal(result.state.periodIncomes['2026-09'], undefined);
  assert.deepEqual(result.state.categories.map(category => category.id), DEFAULT_CATEGORIES.map(category => category.id));
});

test('migration preserves expenses, custom categories, and legacy edu', () => {
  const expenses = [{ id: 'x', title: 'Sách', amount: 90000, date: '2026-09-03', catId: 'edu' }];
  const storage = memoryStorage({
    silo_expenses: JSON.stringify(expenses),
    silo_categories: JSON.stringify(oldCategories),
  });
  const first = createRepository(storage).load();
  const second = createRepository(storage).load();
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(second.state.expenses, expenses);
  assert.equal(second.state.categories.filter(category => category.id === 'pet').length, 1);
  assert.equal(second.state.categories.filter(category => category.id === 'edu').length, 1);
  assert.equal(second.state.categories.filter(category => category.id === 'saving').length, 1);
  assert.equal(second.state.categories.find(category => category.id === 'bill').name, 'Hóa đơn & dịch vụ');
  assert.equal(second.state.categories.length, first.state.categories.length);
});

test('migration does not overwrite a customized bill name', () => {
  const categories = oldCategories.map(category => category.id === 'bill' ? { ...category, name: 'Tiền cố định' } : category);
  const result = createRepository(memoryStorage({ silo_categories: JSON.stringify(categories) })).load();
  assert.equal(result.state.categories.find(category => category.id === 'bill').name, 'Tiền cố định');
});

test('malformed financial JSON returns read-only error and remains untouched', () => {
  const storage = memoryStorage({ silo_expenses: '{broken' });
  const result = createRepository(storage).load();
  assert.deepEqual(result, { ok: false, code: 'MALFORMED_DATA', key: 'silo_expenses' });
  assert.equal(storage.getItem('silo_expenses'), '{broken');
});

test('invalid theme and start day safely fall back', () => {
  const storage = memoryStorage({ silo_theme: 'neon', silo_cycle_start_day: '99' });
  const result = createRepository(storage).load();
  assert.equal(result.state.theme, 'system');
  assert.equal(result.state.cycleStartDay, 1);
});

test('period income persists as a positive safe integer', () => {
  const storage = memoryStorage();
  const repository = createRepository(storage);
  repository.load();
  repository.savePeriodIncome('2026-09', 5_000_000);
  assert.equal(createRepository(storage).load().state.periodIncomes['2026-09'], 5_000_000);
  assert.throws(() => repository.savePeriodIncome('2026-09', 0), /positive safe integer/);
});
```

- [ ] **Step 2: Run the storage tests and verify red**

Run:

```bash
node --test tests/storage.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `storage.js`.

- [ ] **Step 3: Implement storage constants, categories, validators, and load result**

Create `storage.js` with these exact keys and category order:

```js
const KEYS = Object.freeze({
  expenses: 'silo_expenses',
  categories: 'silo_categories',
  incomes: 'silo_period_incomes',
  cycleStartDay: 'silo_cycle_start_day',
  theme: 'silo_theme',
  lastCategory: 'silo_last_category',
  schema: 'silo_schema_version',
  transaction: 'silo_pending_transaction',
});

const SCHEMA_VERSION = 2;
const THEMES = new Set(['system', 'light', 'dark']);

export const DEFAULT_CATEGORIES = Object.freeze([
  { id: 'food', name: 'Ăn uống', emoji: '🍜', color: '#F97316' },
  { id: 'transport', name: 'Đi lại', emoji: '🛵', color: '#2563EB' },
  { id: 'housing', name: 'Nhà ở', emoji: '🏠', color: '#0D9488' },
  { id: 'bill', name: 'Hóa đơn & dịch vụ', emoji: '🧾', color: '#CA8A04' },
  { id: 'shopping', name: 'Mua sắm', emoji: '🛍️', color: '#DB2777' },
  { id: 'health', name: 'Sức khỏe', emoji: '💊', color: '#16A34A' },
  { id: 'investment', name: 'Đầu tư', emoji: '📈', color: '#4F46E5' },
  { id: 'saving', name: 'Tiết kiệm', emoji: '🐷', color: '#0891B2' },
  { id: 'growth', name: 'Phát triển bản thân', emoji: '🌱', color: '#65A30D' },
  { id: 'fun', name: 'Giải trí', emoji: '🎮', color: '#9333EA' },
  { id: 'family', name: 'Gia đình & quà tặng', emoji: '🎁', color: '#A16207' },
  { id: 'other', name: 'Khác', emoji: '📌', color: '#64748B' },
]);

function parseJson(storage, key, fallback) {
  const raw = storage.getItem(key);
  if (raw === null) return { ok: true, value: fallback };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, code: 'MALFORMED_DATA', key };
  }
}

function validExpense(item) {
  return item && typeof item.id === 'string' && item.id &&
    typeof item.title === 'string' && item.title.trim().length > 0 && item.title.length <= 80 &&
    Number.isSafeInteger(item.amount) && item.amount > 0 &&
    validDateKey(item.date) && typeof item.catId === 'string';
}

function validDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(year, month, 0).getDate();
}

function validCategory(item) {
  return item && typeof item.id === 'string' && item.id &&
    typeof item.name === 'string' && item.name.trim() &&
    typeof item.emoji === 'string' && item.emoji && /^#[0-9A-Fa-f]{6}$/.test(item.color);
}

function validIncomes(value) {
  return value && !Array.isArray(value) && typeof value === 'object' &&
    Object.entries(value).every(([key, amount]) => /^\d{4}-\d{2}$/.test(key) && Number.isSafeInteger(amount) && amount > 0);
}

function migrateCategories(categories) {
  const next = categories.map(category => ({ ...category }));
  const bill = next.find(category => category.id === 'bill');
  if (bill && ['Hóa đơn', 'Hoá đơn'].includes(bill.name)) {
    Object.assign(bill, { name: 'Hóa đơn & dịch vụ', emoji: '🧾' });
  }
  for (const defaultCategory of DEFAULT_CATEGORIES) {
    if (!next.some(category => category.id === defaultCategory.id)) next.push({ ...defaultCategory });
  }
  return next;
}
```

Continue `storage.js` with the exact repository implementation below. It validates all financial data before migration, clones caller-owned values, and wraps browser quota/security errors without destroying their cause:

```js
function storageError(cause) {
  const error = new Error('Unable to write local storage', { cause });
  error.code = 'STORAGE_WRITE_FAILED';
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function restoreRaw(storage, key, raw) {
  if (raw === null) storage.removeItem(key);
  else storage.setItem(key, raw);
}

function recoverPendingTransaction(storage) {
  const raw = storage.getItem(KEYS.transaction);
  if (raw === null) return { ok: true };
  let pending;
  try {
    pending = JSON.parse(raw);
  } catch {
    return { ok: false, code: 'MALFORMED_DATA', key: KEYS.transaction };
  }
  if (!pending || pending.type !== 'delete-category' ||
      !Object.hasOwn(pending, 'expensesBefore') || !Object.hasOwn(pending, 'categoriesBefore')) {
    return { ok: false, code: 'MALFORMED_DATA', key: KEYS.transaction };
  }
  try {
    restoreRaw(storage, KEYS.expenses, pending.expensesBefore);
    restoreRaw(storage, KEYS.categories, pending.categoriesBefore);
    storage.removeItem(KEYS.transaction);
    return { ok: true };
  } catch (cause) {
    throw storageError(cause);
  }
}

export function createRepository(storage) {
  let current = null;

  function write(key, value) {
    try {
      storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    } catch (cause) {
      throw storageError(cause);
    }
  }

  function load() {
    const recovery = recoverPendingTransaction(storage);
    if (!recovery.ok) return recovery;

    const expensesResult = parseJson(storage, KEYS.expenses, []);
    const categoriesResult = parseJson(storage, KEYS.categories, []);
    const incomesResult = parseJson(storage, KEYS.incomes, {});
    for (const result of [expensesResult, categoriesResult, incomesResult]) {
      if (!result.ok) return result;
    }
    if (!Array.isArray(expensesResult.value) || !expensesResult.value.every(validExpense)) {
      return { ok: false, code: 'MALFORMED_DATA', key: KEYS.expenses };
    }
    if (!Array.isArray(categoriesResult.value) || !categoriesResult.value.every(validCategory)) {
      return { ok: false, code: 'MALFORMED_DATA', key: KEYS.categories };
    }
    if (!validIncomes(incomesResult.value)) {
      return { ok: false, code: 'MALFORMED_DATA', key: KEYS.incomes };
    }

    const themeRaw = storage.getItem(KEYS.theme);
    const dayRaw = Number(storage.getItem(KEYS.cycleStartDay));
    const categories = migrateCategories(categoriesResult.value);
    current = {
      expenses: clone(expensesResult.value),
      categories,
      periodIncomes: clone(incomesResult.value),
      cycleStartDay: Number.isInteger(dayRaw) && dayRaw >= 1 && dayRaw <= 31 ? dayRaw : 1,
      theme: THEMES.has(themeRaw) ? themeRaw : 'system',
      lastCategory: storage.getItem(KEYS.lastCategory) || 'food',
      schemaVersion: SCHEMA_VERSION,
    };
    write(KEYS.categories, current.categories);
    write(KEYS.schema, String(SCHEMA_VERSION));
    return { ok: true, state: clone(current) };
  }

  function requireLoaded() {
    if (!current) throw new Error('Repository must be loaded first');
  }

  function saveExpenses(expenses) {
    requireLoaded();
    if (!Array.isArray(expenses) || !expenses.every(validExpense)) throw new TypeError('Invalid expenses');
    const next = clone(expenses);
    write(KEYS.expenses, next);
    current.expenses = next;
  }

  function saveCategories(categories) {
    requireLoaded();
    if (!Array.isArray(categories) || !categories.every(validCategory)) throw new TypeError('Invalid categories');
    if (!categories.some(category => category.id === 'other')) throw new TypeError('Category other is required');
    const next = clone(categories);
    write(KEYS.categories, next);
    current.categories = next;
  }

  function savePeriodIncome(periodKey, amount) {
    requireLoaded();
    if (!/^\d{4}-\d{2}$/.test(periodKey) || !Number.isSafeInteger(amount) || amount <= 0) {
      throw new TypeError('Income must be a positive safe integer');
    }
    const next = { ...current.periodIncomes, [periodKey]: amount };
    write(KEYS.incomes, next);
    current.periodIncomes = next;
  }

  function saveCycleStartDay(day) {
    requireLoaded();
    if (!Number.isInteger(day) || day < 1 || day > 31) throw new TypeError('Start day must be 1 through 31');
    write(KEYS.cycleStartDay, String(day));
    current.cycleStartDay = day;
  }

  function saveTheme(theme) {
    requireLoaded();
    if (!THEMES.has(theme)) throw new TypeError('Invalid theme');
    write(KEYS.theme, theme);
    current.theme = theme;
  }

  function saveLastCategory(categoryId) {
    requireLoaded();
    if (typeof categoryId !== 'string' || !categoryId) throw new TypeError('Invalid category id');
    write(KEYS.lastCategory, categoryId);
    current.lastCategory = categoryId;
  }

  return { load, saveExpenses, saveCategories, savePeriodIncome, saveCycleStartDay, saveTheme, saveLastCategory };
}
```

Task 6 extends this returned repository with `deleteCategory`. Do not expose raw storage values to `app.js`.

- [ ] **Step 4: Run storage and complete tests**

Run:

```bash
node --test tests/storage.test.js
npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit guarded storage and migration**

```bash
git add storage.js tests/storage.test.js
git commit -m "feat: add guarded local data migration"
```

---

### Task 3: Replace the monolithic page with an accessible app shell and adaptive visual system

**Files:**

- Modify: `index.html:1-464`
- Create: `styles.css`
- Create: `app.js`
- Create: `tests/static.test.js`

**Interfaces:**

- Consumes: `createRepository()` from `storage.js`; all pure functions from `logic.js`.
- Produces: stable DOM IDs and form names used by Tasks 4–7; `app.js` initially bootstraps data and renders the read-only shell.

- [ ] **Step 1: Write failing static-contract tests**

Create `tests/static.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8').catch(() => '');

test('page keeps zoom available and loads external app assets', () => {
  assert.doesNotMatch(index, /user-scalable=no|maximum-scale=1/);
  assert.match(index, /href="styles\.css"/);
  assert.match(index, /src="app\.js" type="module"/);
  assert.doesNotMatch(index, /<style[\s>]/);
  const inlineScripts = [...index.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(inlineScripts.length, 1);
  assert.match(inlineScripts[0][1], /silo_theme/);
});

test('forms expose numeric money entry and named errors', () => {
  assert.match(index, /id="expenseAmount"[^>]*inputmode="numeric"/);
  assert.match(index, /id="incomeAmount"[^>]*inputmode="numeric"/);
  assert.match(index, /data-triple-zero="expenseAmount"/);
  assert.match(index, /data-triple-zero="incomeAmount"/);
  assert.match(index, /id="expenseAmountError"[^>]*role="alert"/);
});

test('app shell contains accessible live and dialog regions', () => {
  assert.match(index, /id="appStatus"[^>]*aria-live="polite"/);
  assert.match(index, /id="storageError"[^>]*role="alert"/);
  assert.match(index, /<dialog[^>]*id="expenseSheet"/);
  assert.match(index, /<dialog[^>]*id="confirmDialog"/);
});

test('styles contain light, dark, safe-area, focus, and reduced-motion rules', () => {
  assert.match(styles, /:root\s*{/);
  assert.match(styles, /\[data-theme="dark"\]/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /prefers-reduced-motion/);
});
```

- [ ] **Step 2: Run static tests and verify red**

Run:

```bash
node --test tests/static.test.js
```

Expected: FAIL because `styles.css` and the new semantic shell do not exist.

- [ ] **Step 3: Replace `index.html` with the semantic shell**

The replacement must contain these exact high-level regions and IDs; keep all labels in Vietnamese:

```html
<!doctype html>
<html lang="vi" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="Silo">
  <meta name="theme-color" id="themeColor" content="#F4F7F5">
  <link rel="apple-touch-icon" href="icons/icon-192.svg">
  <link rel="icon" type="image/svg+xml" href="icons/icon-192.svg">
  <link rel="manifest" href="manifest.json">
  <link rel="stylesheet" href="styles.css">
  <script>
    try {
      const choice = localStorage.getItem('silo_theme');
      const dark = choice === 'dark' || (choice !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    } catch {}
  </script>
  <title>Silo — Quản lý chi tiêu</title>
</head>
<body>
  <header class="app-header">
    <div><p class="eyebrow">Tài chính cá nhân</p><h1>Silo</h1></div>
    <button id="themeButton" class="icon-button" type="button" aria-label="Đổi giao diện" aria-haspopup="dialog">☼</button>
  </header>

  <main id="app" inert>
    <section class="period-nav" aria-label="Chọn kỳ chi tiêu">
      <button id="previousPeriod" class="icon-button" type="button" aria-label="Kỳ trước">‹</button>
      <button id="periodPicker" class="period-title" type="button" aria-label="Cài đặt kỳ chi tiêu">
        <strong id="periodLabel">Kỳ tháng 9</strong>
        <span id="periodRange">01/09–30/09</span>
      </button>
      <button id="nextPeriod" class="icon-button" type="button" aria-label="Kỳ sau">›</button>
    </section>

    <section id="summary" class="summary" aria-labelledby="remainingLabel">
      <p id="remainingLabel" class="summary-label">Còn lại</p>
      <p id="remainingAmount" class="summary-amount">—</p>
      <p id="periodStatus" class="status-text">Chưa nhập thu nhập kỳ này</p>
      <div class="progress" role="progressbar" aria-label="Mức sử dụng thu nhập" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <span id="progressFill"></span>
      </div>
      <dl class="summary-details">
        <div><dt>Thu nhập</dt><dd><button id="incomeButton" type="button">Nhập thu nhập</button></dd></div>
        <div><dt>Đã dùng</dt><dd id="spentAmount">0 ₫</dd></div>
      </dl>
    </section>

    <section class="transactions" aria-labelledby="transactionsTitle">
      <div class="section-heading"><h2 id="transactionsTitle">Khoản chi</h2><button id="manageCategories" type="button">Danh mục</button></div>
      <div id="categoryFilter" class="category-filter" role="toolbar" aria-label="Lọc theo danh mục"></div>
      <div id="expenseList"></div>
    </section>
  </main>

  <button id="addExpense" class="fab" type="button" aria-label="Thêm khoản chi">+</button>
  <p id="appStatus" class="toast" aria-live="polite" aria-atomic="true"></p>
  <section id="storageError" class="fatal-error" role="alert" hidden></section>
  <button id="updateBanner" class="update-banner" type="button" hidden>Có bản cập nhật — Tải lại</button>

  <dialog id="incomeSheet" class="sheet" aria-labelledby="incomeTitle">
    <form id="incomeForm" novalidate>
      <header><h2 id="incomeTitle">Thu nhập kỳ này</h2><button type="button" data-close="incomeSheet" aria-label="Đóng">×</button></header>
      <label for="incomeAmount">Số tiền</label>
      <div class="money-control"><input id="incomeAmount" name="incomeAmount" type="text" inputmode="numeric" autocomplete="off" aria-describedby="incomeAmountError"><button type="button" data-triple-zero="incomeAmount">000</button><span>₫</span></div>
      <p id="incomeAmountError" class="field-error" role="alert"></p>
      <button class="primary-button" type="submit">Lưu thu nhập</button>
    </form>
  </dialog>

  <dialog id="expenseSheet" class="sheet" aria-labelledby="expenseTitle">
    <form id="expenseForm" novalidate>
      <header><h2 id="expenseTitle">Thêm khoản chi</h2><button type="button" data-close="expenseSheet" aria-label="Đóng">×</button></header>
      <label for="expenseAmount">Số tiền</label>
      <div class="money-control"><input id="expenseAmount" name="expenseAmount" type="text" inputmode="numeric" autocomplete="off" aria-describedby="expenseAmountError"><button type="button" data-triple-zero="expenseAmount">000</button><span>₫</span></div>
      <p id="expenseAmountError" class="field-error" role="alert"></p>
      <label for="expenseTitleInput">Tiêu đề</label><input id="expenseTitleInput" name="title" maxlength="80" autocomplete="off"><p id="expenseTitleError" class="field-error" role="alert"></p>
      <fieldset><legend>Danh mục</legend><div id="categoryGrid" class="category-grid"></div></fieldset>
      <label for="expenseDate">Ngày</label><input id="expenseDate" name="date" type="date"><p id="expenseDateError" class="field-error" role="alert"></p>
      <button class="primary-button" type="submit">Lưu khoản chi</button>
    </form>
  </dialog>

  <dialog id="periodSettingsSheet" class="sheet" aria-labelledby="periodSettingsTitle"><form id="periodSettingsForm"><header><h2 id="periodSettingsTitle">Cài đặt kỳ</h2><button type="button" data-close="periodSettingsSheet" aria-label="Đóng">×</button></header><label for="cycleStartDay">Ngày bắt đầu kỳ</label><input id="cycleStartDay" type="number" inputmode="numeric" min="1" max="31"><p id="cycleStartDayError" class="field-error" role="alert"></p><button class="primary-button" type="submit">Lưu ngày bắt đầu</button></form></dialog>
  <dialog id="themeSheet" class="sheet" aria-labelledby="themeTitle"><form id="themeForm"><header><h2 id="themeTitle">Giao diện</h2><button type="button" data-close="themeSheet" aria-label="Đóng">×</button></header><label><input type="radio" name="theme" value="system"> Theo hệ thống</label><label><input type="radio" name="theme" value="light"> Sáng</label><label><input type="radio" name="theme" value="dark"> Tối</label></form></dialog>
  <dialog id="categorySheet" class="sheet wide-sheet" aria-labelledby="categoryTitle"><section><header><h2 id="categoryTitle">Quản lý danh mục</h2><button type="button" data-close="categorySheet" aria-label="Đóng">×</button></header><ol id="categoryManagerList"></ol><button id="addCategoryButton" type="button">Thêm danh mục</button></section></dialog>
  <dialog id="categoryEditor" class="sheet" aria-labelledby="categoryEditorTitle"><form id="categoryForm"><header><h2 id="categoryEditorTitle">Danh mục</h2><button type="button" data-close="categoryEditor" aria-label="Đóng">×</button></header><input id="categoryId" type="hidden"><label for="categoryName">Tên</label><input id="categoryName" maxlength="40"><p id="categoryNameError" class="field-error" role="alert"></p><label for="categoryEmoji">Biểu tượng</label><input id="categoryEmoji" maxlength="8"><label for="categoryColor">Màu</label><input id="categoryColor" type="color"><button class="primary-button" type="submit">Lưu danh mục</button></form></dialog>
  <dialog id="confirmDialog" class="confirm-dialog" aria-labelledby="confirmTitle"><form method="dialog"><h2 id="confirmTitle">Xác nhận</h2><p id="confirmMessage"></p><div class="button-row"><button value="cancel">Hủy</button><button id="confirmAction" class="danger-button" value="confirm">Xóa</button></div></form></dialog>

  <script src="app.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 4: Implement the visual system in `styles.css`**

Use this token contract as the exact foundation; all later rules consume these variables:

```css
* { box-sizing: border-box; }
:root {
  color-scheme: light;
  --bg: #f4f7f5;
  --surface: #ffffff;
  --surface-muted: #e9efec;
  --text: #10231c;
  --muted: #5c6f67;
  --border: #d5dfda;
  --primary: #0b7a53;
  --primary-ink: #ffffff;
  --warning: #8a6100;
  --danger: #b42318;
  --focus: #0a66c2;
  --shadow: 0 12px 30px rgb(16 35 28 / 12%);
  --radius: 18px;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
[data-theme="dark"] {
  color-scheme: dark;
  --bg: #09130f;
  --surface: #111f19;
  --surface-muted: #1b2d25;
  --text: #f1f7f4;
  --muted: #a6b8b0;
  --border: #2a4037;
  --primary: #5ddba6;
  --primary-ink: #052b1d;
  --warning: #f4c95d;
  --danger: #ff8a80;
  --focus: #7cc4ff;
  --shadow: 0 14px 36px rgb(0 0 0 / 32%);
}
html { min-width: 320px; background: var(--bg); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { min-height: 100dvh; margin: 0; padding: calc(12px + var(--safe-top)) 16px calc(96px + var(--safe-bottom)); background: var(--bg); color: var(--text); }
button, input { font: inherit; }
button { min-width: 44px; min-height: 44px; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.app-header, .period-nav, .section-heading, .button-row, .money-control { display: flex; align-items: center; }
.app-header, .section-heading { justify-content: space-between; }
.eyebrow { margin: 0; color: var(--muted); font-size: .75rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
h1 { margin: 2px 0 0; font-size: clamp(1.65rem, 8vw, 2.2rem); }
.icon-button { border: 1px solid var(--border); border-radius: 50%; background: var(--surface); color: var(--text); }
.period-nav { gap: 8px; margin: 18px 0 12px; }
.period-title { flex: 1; border: 0; background: transparent; color: var(--text); }
.period-title strong, .period-title span { display: block; }
.period-title span { margin-top: 2px; color: var(--muted); font-size: .8rem; }
.summary { padding: 20px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
.summary-label, .status-text { margin: 0; color: var(--muted); }
.summary-amount { margin: 4px 0 8px; font-size: clamp(2.25rem, 12vw, 4rem); font-weight: 750; font-variant-numeric: tabular-nums; letter-spacing: -.04em; }
.progress { height: 8px; margin: 16px 0; overflow: hidden; border-radius: 99px; background: var(--surface-muted); }
.progress > span { display: block; width: 0; height: 100%; background: var(--primary); transition: width 180ms ease; }
.summary-details { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0; }
.summary-details div { min-width: 0; }
.summary-details dt { color: var(--muted); font-size: .75rem; }
.summary-details dd { margin: 4px 0 0; font-weight: 700; font-variant-numeric: tabular-nums; }
.transactions { margin-top: 24px; }
.category-filter { display: flex; gap: 8px; margin: 12px -16px; padding: 0 16px 4px; overflow-x: auto; scrollbar-width: none; }
.category-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.category-option { display: flex; min-height: 52px; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); color: var(--text); text-align: left; }
.category-option[aria-pressed="true"] { border: 2px solid var(--primary); }
.fab { position: fixed; right: 18px; bottom: calc(18px + var(--safe-bottom)); width: 58px; height: 58px; border: 0; border-radius: 50%; background: var(--primary); color: var(--primary-ink); box-shadow: var(--shadow); font-size: 2rem; }
.sheet { width: min(100%, 560px); max-height: min(88dvh, 760px); margin: auto auto 0; padding: 20px 18px calc(20px + var(--safe-bottom)); overflow-y: auto; border: 0; border-radius: 24px 24px 0 0; background: var(--surface); color: var(--text); }
.sheet::backdrop, .confirm-dialog::backdrop { background: rgb(0 0 0 / 48%); }
.sheet form > header, .sheet section > header { display: flex; align-items: center; justify-content: space-between; }
.sheet input:not([type="radio"]):not([type="color"]) { width: 100%; min-height: 48px; margin: 6px 0; padding: 11px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); color: var(--text); }
.money-control { gap: 8px; }
.money-control input { flex: 1; min-width: 0; font-size: 1.35rem; font-variant-numeric: tabular-nums; }
.money-control button { padding: 0 14px; border: 1px solid var(--primary); border-radius: 12px; background: var(--surface-muted); color: var(--primary); font-weight: 800; }
.primary-button, .danger-button { width: 100%; margin-top: 16px; border: 0; border-radius: 14px; font-weight: 750; }
.primary-button { background: var(--primary); color: var(--primary-ink); }
.danger-button { background: var(--danger); color: #fff; }
.field-error { min-height: 1.2em; margin: 2px 0 10px; color: var(--danger); font-size: .85rem; }
.toast, .update-banner { position: fixed; left: 50%; bottom: calc(88px + var(--safe-bottom)); transform: translateX(-50%); z-index: 20; }
@media (min-width: 700px) { body { width: min(100%, 720px); margin-inline: auto; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; transition-duration: .01ms !important; } }
```

Append these component rules. Reuse only the token variables above; do not add gradients, glass effects, remote fonts, or nested decorative card shells:

```css
.section-heading h2, .sheet h2 { margin: 0; }
.section-heading button, .filter-chip, .text-button { border: 0; background: transparent; color: var(--primary); font-weight: 700; }
.filter-chip { flex: 0 0 auto; padding: 0 14px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text); }
.filter-chip[aria-pressed="true"] { border-color: var(--primary); background: var(--primary); color: var(--primary-ink); }
.date-group { margin-top: 18px; }
.date-heading { margin: 0 0 6px; color: var(--muted); font-size: .8rem; font-weight: 750; }
.expense-row { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; min-height: 64px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.expense-icon { display: grid; width: 44px; height: 44px; place-items: center; border-radius: 13px; background: var(--surface-muted); font-size: 1.25rem; }
.expense-copy { min-width: 0; }
.expense-title, .expense-category { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.expense-category { margin-top: 2px; color: var(--muted); font-size: .8rem; }
.expense-amount { font-weight: 800; font-variant-numeric: tabular-nums; }
.expense-actions { display: flex; grid-column: 2 / -1; justify-content: flex-end; gap: 8px; }
.expense-actions button, .category-actions button { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); }
.empty-state { padding: 32px 12px; color: var(--muted); text-align: center; }
.category-manager-list { margin: 12px 0; padding: 0; list-style: none; }
.category-manager-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
.category-actions { display: flex; gap: 6px; }
.theme-choice { display: flex; min-height: 52px; align-items: center; gap: 10px; border-bottom: 1px solid var(--border); }
.theme-choice:has(input:checked) { color: var(--primary); font-weight: 750; }
.fatal-error { margin: 24px auto; max-width: 560px; padding: 18px; border: 1px solid var(--danger); border-radius: var(--radius); background: var(--surface); color: var(--danger); }
.toast, .update-banner { width: max-content; max-width: calc(100% - 32px); padding: 10px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--text); color: var(--bg); box-shadow: var(--shadow); text-align: center; }
.toast:empty { display: none; }
.update-banner { border: 0; }
.confirm-dialog { width: min(calc(100% - 32px), 420px); padding: 20px; border: 0; border-radius: var(--radius); background: var(--surface); color: var(--text); }
.button-row { gap: 8px; justify-content: flex-end; }
.button-row button { padding-inline: 16px; }
.summary-amount, .summary-details dd, .expense-amount { overflow-wrap: anywhere; }
```

- [ ] **Step 5: Create a minimal bootstrap in `app.js`**

Use the guarded repository and keep the page inert on corrupted data:

```js
import { createRepository } from './storage.js';
import { periodBounds, periodKeyForDate } from './logic.js';

const repository = createRepository(localStorage);
const loaded = repository.load();
const app = document.querySelector('#app');

if (!loaded.ok) {
  const error = document.querySelector('#storageError');
  error.hidden = false;
  error.textContent = 'Silo không đọc được dữ liệu đang lưu và đã dừng ghi để tránh ghi đè.';
} else {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const state = {
    ...loaded.state,
    selectedPeriodKey: periodKeyForDate(todayKey, loaded.state.cycleStartDay),
    selectedCategoryId: 'all',
    editingExpenseId: null,
    dirtyDialogId: null,
  };
  const bounds = periodBounds(state.selectedPeriodKey, state.cycleStartDay);
  document.querySelector('#periodLabel').textContent = bounds.label;
  document.querySelector('#periodRange').textContent = bounds.rangeLabel;
  app.inert = false;
}
```

- [ ] **Step 6: Run tests and inspect the shell locally**

Run:

```bash
npm test
python3 -m http.server 4173
```

Expected: tests PASS. Open `http://localhost:4173/`; the new shell is readable, does not throw in the console, and no control is functional beyond initial data load yet. Stop the server with Control-C after inspection.

- [ ] **Step 7: Commit the shell and visual foundation**

```bash
git add index.html styles.css app.js tests/static.test.js
git commit -m "feat: add accessible Silo app shell"
```

---

### Task 4: Implement theme selection, period navigation, income, and configurable start day

**Files:**

- Modify: `app.js`
- Modify: `styles.css`
- Modify: `tests/logic.test.js`
- Modify: `tests/static.test.js`

**Interfaces:**

- Consumes: Task 1 period/summary functions and Task 2 repository writers.
- Produces:
  - `render(): void`
  - `applyTheme(choice: 'system' | 'light' | 'dark'): void`
  - `openIncomeEditor(): void`
  - `saveIncome(event: SubmitEvent): void`
  - `saveCycleStartDay(event: SubmitEvent): void`
  - state fields used by later expense/category rendering.

- [ ] **Step 1: Add failing summary-status boundary tests**

Append to `tests/logic.test.js`:

```js
test('summary changes status exactly at 80 and 100 percent', () => {
  assert.equal(calculatePeriodSummary(100, [{ amount: 79 }]).status, 'ok');
  assert.equal(calculatePeriodSummary(100, [{ amount: 80 }]).status, 'warning');
  assert.equal(calculatePeriodSummary(100, [{ amount: 100 }]).status, 'exceeded');
  assert.equal(calculatePeriodSummary(100, [{ amount: 101 }]).status, 'exceeded');
});
```

The approved behavior is “at or above 100%,” so use this exact status boundary:

```js
const status = remaining <= 0 ? 'exceeded' : percentageUsed >= 80 ? 'warning' : 'ok';
```

- [ ] **Step 2: Verify the new boundary test fails**

Run:

```bash
node --test tests/logic.test.js
```

Expected: FAIL at the 100% assertion until `calculatePeriodSummary` uses `remaining <= 0`.

- [ ] **Step 3: Create the shared state and render pipeline in `app.js`**

Replace the Task 3 temporary local `state` with module-level state after successful load:

```js
let state;
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
const STATUS_COPY = {
  missing: 'Chưa nhập thu nhập kỳ này',
  ok: 'Còn trong kế hoạch',
  warning: 'Sắp dùng hết thu nhập kỳ này',
  exceeded: 'Đã chi vượt thu nhập kỳ này',
};

function selectedBounds() {
  return periodBounds(state.selectedPeriodKey, state.cycleStartDay);
}

function selectedExpenses() {
  return expensesForPeriod(state.expenses, selectedBounds(), state.selectedCategoryId);
}

function allSelectedPeriodExpenses() {
  return expensesForPeriod(state.expenses, selectedBounds());
}

function render() {
  const bounds = selectedBounds();
  const income = state.periodIncomes[state.selectedPeriodKey] ?? null;
  const summary = calculatePeriodSummary(income, allSelectedPeriodExpenses());
  document.querySelector('#periodLabel').textContent = bounds.label;
  document.querySelector('#periodRange').textContent = bounds.rangeLabel;
  document.querySelector('#remainingLabel').textContent = summary.status === 'exceeded' ? 'Vượt' : 'Còn lại';
  document.querySelector('#remainingAmount').textContent = summary.remaining === null ? '—' : formatVnd(Math.abs(summary.remaining));
  document.querySelector('#periodStatus').textContent = STATUS_COPY[summary.status];
  document.querySelector('#incomeButton').textContent = income === null ? 'Nhập thu nhập' : formatVnd(income);
  document.querySelector('#spentAmount').textContent = formatVnd(summary.spent);
  const progress = document.querySelector('.progress');
  const percentage = summary.percentageUsed ?? 0;
  progress.setAttribute('aria-valuenow', String(Math.min(100, Math.round(percentage))));
  progress.setAttribute('aria-valuetext', summary.percentageUsed === null ? 'Chưa có thu nhập' : `Đã dùng ${Math.round(percentage)} phần tr`);
  document.querySelector('#progressFill').style.width = `${Math.min(100, percentage)}%`;
  document.querySelector('#summary').dataset.status = summary.status;
  renderCategoryFilter();
  renderExpenseList();
}

// Temporary Task 4 placeholders. Task 5 replaces both with full renderers.
function renderCategoryFilter() {
  document.querySelector('#categoryFilter').replaceChildren();
}

function renderExpenseList() {
  const list = document.querySelector('#expenseList');
  list.textContent = allSelectedPeriodExpenses().length
    ? `${allSelectedPeriodExpenses().length} khoản chi trong kỳ`
    : 'Chưa có khoản chi trong kỳ này';
}
```

Import every referenced function by its exact Task 1 name.

- [ ] **Step 4: Implement theme behavior and the three-option control**

Add:

```js
function effectiveTheme(choice) {
  return choice === 'system' ? (systemTheme.matches ? 'dark' : 'light') : choice;
}

function applyTheme(choice) {
  const effective = effectiveTheme(choice);
  document.documentElement.dataset.theme = effective;
  document.querySelector('#themeColor').content = effective === 'dark' ? '#09130F' : '#F4F7F5';
  document.querySelector('#themeButton').textContent = effective === 'dark' ? '☾' : '☼';
  for (const radio of document.querySelectorAll('input[name="theme"]')) radio.checked = radio.value === choice;
}

document.querySelector('#themeButton').addEventListener('click', () => document.querySelector('#themeSheet').showModal());
document.querySelector('#themeForm').addEventListener('change', event => {
  if (event.target.name !== 'theme') return;
  repository.saveTheme(event.target.value);
  state.theme = event.target.value;
  applyTheme(state.theme);
  document.querySelector('#themeSheet').close();
});
systemTheme.addEventListener('change', () => { if (state.theme === 'system') applyTheme('system'); });
```

Wrap preference writes in the shared storage-error presenter so a failure is visible and does not change in-memory state.

- [ ] **Step 5: Implement period navigation and income editing**

Wire previous/next using `shiftPeriodKey`. On navigation reset `selectedCategoryId` to `all` and call `render()`.

For `incomeForm`:

```js
function openIncomeEditor() {
  const input = document.querySelector('#incomeAmount');
  input.value = formatMoneyInput(state.periodIncomes[state.selectedPeriodKey] ?? '');
  document.querySelector('#incomeAmountError').textContent = '';
  document.querySelector('#incomeSheet').showModal();
  requestAnimationFrame(() => input.focus({ preventScroll: true }));
}

function saveIncome(event) {
  event.preventDefault();
  const input = document.querySelector('#incomeAmount');
  const amount = parsePositiveAmount(input.value);
  if (amount === null) {
    document.querySelector('#incomeAmountError').textContent = 'Thu nhập phải lớn hơn 0.';
    input.focus();
    return;
  }
  try {
    repository.savePeriodIncome(state.selectedPeriodKey, amount);
    state.periodIncomes = { ...state.periodIncomes, [state.selectedPeriodKey]: amount };
    document.querySelector('#incomeSheet').close();
    announce('Đã lưu thu nhập');
    render();
  } catch {
    document.querySelector('#incomeAmountError').textContent = 'Không thể lưu trên iPhone. Hãy kiểm tra dung lượng và thử lại.';
  }
}
```

- [ ] **Step 6: Implement the cycle-start-day confirmation flow**

Opening `periodSettingsSheet` shows the current day. Submission validates integer 1–31. If changed, call a reusable `confirmAction(message, actionLabel)` dialog helper with:

```js
const message = `Đổi ngày bắt đầu sang ngày ${day}? Các khoản chi cũ sẽ được nhóm lại theo kỳ mới nhưng không bị xóa.`;
```

On confirmation:

```js
repository.saveCycleStartDay(day);
state.cycleStartDay = day;
state.selectedPeriodKey = periodKeyForDate(todayKey(), day);
state.selectedCategoryId = 'all';
document.querySelector('#periodSettingsSheet').close();
announce('Đã đổi ngày bắt đầu kỳ');
render();
```

No transaction record is rewritten.

- [ ] **Step 7: Wire amount formatting and the `000` shortcut for both money fields**

Use delegation once:

```js
document.addEventListener('input', event => {
  if (!['expenseAmount', 'incomeAmount'].includes(event.target.id)) return;
  event.target.value = formatMoneyInput(event.target.value);
  event.target.setSelectionRange(event.target.value.length, event.target.value.length);
});

document.addEventListener('click', event => {
  const button = event.target.closest('[data-triple-zero]');
  if (!button) return;
  const input = document.getElementById(button.dataset.tripleZero);
  const digits = appendTripleZero(input.value);
  if (!digits) return;
  input.value = formatMoneyInput(digits);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
});
```

- [ ] **Step 8: Verify logic, theme, income, and period behavior**

Run:

```bash
npm test
python3 -m http.server 4173
```

Expected automated result: all tests PASS.

Manual checks at `http://localhost:4173/`:

1. Theme follows the system, then persists forced Light and forced Dark.
2. `5` plus `000` displays `5.000` in income.
3. Income 5,000,000 shows correct remaining value.
4. Start day 25 shows a cross-month label and range.
5. Previous and next controls move one period key at a time.
6. Start day 31 produces a valid February boundary.

- [ ] **Step 9: Commit period, income, and theme behavior**

```bash
git add logic.js app.js styles.css tests/logic.test.js tests/static.test.js
git commit -m "feat: add income periods and adaptive themes"
```

---

### Task 5: Implement safe expense CRUD, fast entry, grouping, and filtering

**Files:**

- Modify: `app.js`
- Modify: `styles.css`
- Modify: `tests/logic.test.js`
- Modify: `tests/static.test.js`

**Interfaces:**

- Consumes: current period state, repository expense writer, money helpers, and categories.
- Produces:
  - `openExpenseEditor(expenseId?: string): void`
  - `saveExpense(event: SubmitEvent): void`
  - `deleteExpense(expenseId: string): Promise<void>`
  - `renderExpenseList(): void`
  - `renderCategoryFilter(): void`

- [ ] **Step 1: Add expense-domain and failing UI contract tests**

Append exact cases to `tests/logic.test.js`:

```js
test('expense filtering does not mutate the source array', () => {
  const source = [
    { id: 'a', amount: 1, date: '2026-09-26', catId: 'food' },
    { id: 'b', amount: 2, date: '2026-09-25', catId: 'saving' },
  ];
  const before = structuredClone(source);
  expensesForPeriod(source, periodBounds('2026-09', 25));
  assert.deepEqual(source, before);
});

test('savings and investment are ordinary expenses in totals', () => {
  const expenses = [{ amount: 1_000_000, catId: 'saving' }, { amount: 500_000, catId: 'investment' }];
  assert.equal(calculatePeriodSummary(5_000_000, expenses).remaining, 3_500_000);
});
```

Append this implementation contract to `tests/static.test.js` so the task begins red:

```js
const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');

test('application implements the complete expense interaction surface', () => {
  assert.match(appSource, /function openExpenseEditor\s*\(/);
  assert.match(appSource, /function saveExpense\s*\(/);
  assert.match(appSource, /function renderExpenseList\s*\(/);
  assert.match(appSource, /function renderCategoryFilter\s*\(/);
  assert.match(appSource, /repository\.saveExpenses\s*\(/);
});
```

- [ ] **Step 2: Verify the expense UI contract is red**

Run:

```bash
node --test tests/logic.test.js tests/static.test.js
```

Expected: logic assertions PASS and the static contract FAIL because the Task 4 placeholders do not yet implement the full expense interaction surface.

- [ ] **Step 3: Implement expense form state and validation**

Use one validator and update state only after a successful storage write:

```js
function expenseFromForm() {
  const amount = parsePositiveAmount(document.querySelector('#expenseAmount').value);
  const title = document.querySelector('#expenseTitleInput').value.trim();
  const date = document.querySelector('#expenseDate').value;
  const categoryExists = state.categories.some(category => category.id === selectedExpenseCategoryId);
  const errors = {
    amount: amount === null ? 'Số tiền phải lớn hơn 0.' : '',
    title: !title ? 'Hãy nhập nội dung khoản chi.' : title.length > 80 ? 'Tiêu đề tối đa 80 ký tự.' : '',
    date: !isValidDateKey(date) ? 'Hãy chọn ngày hợp lệ.' : '',
  };
  return {
    valid: !Object.values(errors).some(Boolean),
    errors,
    value: { title, amount, date, catId: categoryExists ? selectedExpenseCategoryId : 'other' },
  };
}
```

Import `isValidDateKey` from `logic.js` with the other Task 1 helpers.

Display every error in its named alert. On create, generate ID with `crypto.randomUUID()` when available and a timestamp/random fallback that never contains owner text. On edit, preserve the existing ID.

- [ ] **Step 4: Implement the open/save flow**

For a new expense:

- Default date to today's local key.
- Select `state.lastCategory` only when it still exists; otherwise select `food`, then `other` as final fallback.
- Clear all fields and errors.
- Set title `Thêm khoản chi` and submit copy `Lưu khoản chi`.

For edit:

- Fill the stored values.
- Select the stored category or `other` if it no longer exists.
- Set title `Sửa khoản chi` and submit copy `Lưu thay đổi`.

On successful save:

```js
const nextExpenses = state.editingExpenseId
  ? state.expenses.map(item => item.id === state.editingExpenseId ? { ...item, ...result.value } : item)
  : [...state.expenses, { id: createId(), ...result.value }];
repository.saveExpenses(nextExpenses);
state.expenses = nextExpenses;
let savedLastCategory = true;
try {
  repository.saveLastCategory(result.value.catId);
  state.lastCategory = result.value.catId;
} catch {
  savedLastCategory = false;
}
state.selectedPeriodKey = periodKeyForDate(result.value.date, state.cycleStartDay);
state.editingExpenseId = null;
state.dirtyDialogId = null;
document.querySelector('#expenseSheet').close();
announce(savedLastCategory ? 'Đã lưu khoản chi' : 'Đã lưu khoản chi; chưa lưu được danh mục dùng gần nhất');
render();
```

If the primary `saveExpenses` write fails, keep the dialog, entered values, state, and totals unchanged; display the storage failure beside the submit action. `silo_last_category` is only a convenience preference, so its failure must never cause a duplicate expense or make a successfully persisted expense look unsaved.

- [ ] **Step 5: Render filters and transactions with safe DOM APIs**

Create elements instead of HTML strings:

```js
function categoryButton(category, active, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'filter-chip category-chip';
  button.setAttribute('aria-pressed', String(active));
  button.style.setProperty('--category-color', category.color);
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = category.emoji;
  const name = document.createElement('span');
  name.textContent = category.name;
  button.append(icon, name);
  button.addEventListener('click', onClick);
  return button;
}
```

`renderCategoryFilter()` always renders `Tất cả`, then only categories represented in the selected period, preserving category order. `renderExpenseList()` groups `selectedExpenses()` by `date`, creates a heading for each date, and creates each row with `textContent`. Do not assign owner data to `innerHTML`, inline event attributes, URLs, or CSS properties.

- [ ] **Step 6: Implement accessible deletion**

Each expense row has:

- Main edit button covering the non-destructive row content.
- Visible-on-swipe delete button.
- Keyboard/screen-reader delete button reachable without swiping.

Confirmation text is exact:

```js
`Xóa khoản ${expense.title} ${formatVnd(expense.amount)}?`
```

Only after confirmation:

```js
const next = state.expenses.filter(item => item.id !== expense.id);
repository.saveExpenses(next);
state.expenses = next;
announce('Đã xóa khoản chi');
render();
```

- [ ] **Step 7: Track unsaved form state**

When a user changes any expense or income form value, set `state.dirtyDialogId` to that dialog ID. Clear it only after successful save or explicit discard. A close attempt with dirty input asks `Bỏ các thay đổi chưa lưu?`; cancel keeps the sheet open.

- [ ] **Step 8: Verify CRUD and period reassignment**

Run:

```bash
npm test
python3 -m http.server 4173
```

Expected: tests PASS.

Manual cases:

1. Add `Ăn sáng`, type `35`, tap `000`, save, and see `35.000 ₫` in the selected period.
2. Add `Tiết kiệm` and `Đầu tư`; both reduce remaining money.
3. Edit an expense date across a period boundary; the app navigates to and recalculates the destination period.
4. Filter by a represented category; unused categories do not appear in the filter.
5. Delete then cancel; data remains. Delete then confirm; data and totals update.
6. Enter `<img src=x onerror=alert(1)>` as a title; it appears as text and never executes.

- [ ] **Step 9: Commit expense flows**

```bash
git add app.js styles.css tests/logic.test.js tests/static.test.js
git commit -m "feat: add safe manual expense flows"
```

---

### Task 6: Implement category selection, editing, reordering, and safe deletion

**Files:**

- Modify: `storage.js`
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `tests/storage.test.js`

**Interfaces:**

- Consumes: loaded `state.categories`, `state.expenses`, repository writers, confirmation helper.
- Produces: complete category CRUD; recoverable `Repository.deleteCategory(categoryId)` transaction.

- [ ] **Step 1: Add failing transactional category tests**

Append to `tests/storage.test.js`:

```js
test('deleting an in-use category reassigns expenses to other', () => {
  const storage = memoryStorage({
    silo_expenses: JSON.stringify([{ id: 'x', title: 'Quỹ', amount: 100, date: '2026-09-03', catId: 'investment' }]),
    silo_categories: JSON.stringify(DEFAULT_CATEGORIES),
  });
  const repository = createRepository(storage);
  repository.load();
  const result = repository.deleteCategory('investment');
  assert.equal(result.expenses[0].catId, 'other');
  assert.equal(result.categories.some(category => category.id === 'investment'), false);
  assert.equal(storage.getItem('silo_pending_transaction'), null);
});

test('other cannot be deleted', () => {
  const repository = createRepository(memoryStorage());
  repository.load();
  assert.throws(() => repository.deleteCategory('other'), /cannot be deleted/);
});

test('a failed category transaction is recovered on next load', () => {
  const base = memoryStorage({
    silo_expenses: JSON.stringify([{ id: 'x', title: 'Quỹ', amount: 100, date: '2026-09-03', catId: 'investment' }]),
    silo_categories: JSON.stringify(DEFAULT_CATEGORIES),
  });
  let categoryFailuresRemaining = 0;
  const failing = {
    ...base,
    setItem(key, value) {
      if (categoryFailuresRemaining > 0 && key === 'silo_categories') {
        categoryFailuresRemaining -= 1;
        throw new Error('disk full');
      }
      base.setItem(key, value);
    },
  };
  const repository = createRepository(failing);
  repository.load();
  categoryFailuresRemaining = 2;
  assert.throws(() => repository.deleteCategory('investment'));
  const recovered = createRepository(base).load();
  assert.equal(recovered.ok, true);
  assert.equal(recovered.state.expenses[0].catId, 'investment');
  assert.equal(recovered.state.categories.some(category => category.id === 'investment'), true);
});
```

- [ ] **Step 2: Verify transactional tests fail**

Run:

```bash
node --test tests/storage.test.js
```

Expected: FAIL because `deleteCategory` is not implemented.

- [ ] **Step 3: Implement the recoverable deletion transaction**

Before deletion, persist a journal containing exact raw before-images:

```js
const transaction = {
  type: 'delete-category',
  expensesBefore: storage.getItem(KEYS.expenses),
  categoriesBefore: storage.getItem(KEYS.categories),
};
storage.setItem(KEYS.transaction, JSON.stringify(transaction));
```

Inside `createRepository`, insert this function before its return and add `deleteCategory` to the returned object:

```js
function deleteCategory(categoryId) {
  requireLoaded();
  if (categoryId === 'other') throw new TypeError('Category other cannot be deleted');
  if (!current.categories.some(category => category.id === categoryId)) throw new TypeError('Category does not exist');

  const transaction = {
    type: 'delete-category',
    expensesBefore: storage.getItem(KEYS.expenses),
    categoriesBefore: storage.getItem(KEYS.categories),
  };
  const nextExpenses = current.expenses.map(expense =>
    expense.catId === categoryId ? { ...expense, catId: 'other' } : { ...expense }
  );
  const nextCategories = current.categories
    .filter(category => category.id !== categoryId)
    .map(category => ({ ...category }));

  write(KEYS.transaction, transaction);
  try {
    write(KEYS.expenses, nextExpenses);
    write(KEYS.categories, nextCategories);
    storage.removeItem(KEYS.transaction);
  } catch (cause) {
    try {
      restoreRaw(storage, KEYS.expenses, transaction.expensesBefore);
      restoreRaw(storage, KEYS.categories, transaction.categoriesBefore);
      storage.removeItem(KEYS.transaction);
    } catch (restoreCause) {
      // Keep the journal. The next successful load restores both before-images.
      throw storageError(restoreCause);
    }
    throw cause?.code === 'STORAGE_WRITE_FAILED' ? cause : storageError(cause);
  }

  current.expenses = nextExpenses;
  current.categories = nextCategories;
  return clone({ expenses: nextExpenses, categories: nextCategories });
}

return {
  load,
  saveExpenses,
  saveCategories,
  savePeriodIncome,
  saveCycleStartDay,
  saveTheme,
  saveLastCategory,
  deleteCategory,
};
```

The `recoverPendingTransaction(storage)` already added in Task 2 restores the before-images and removes the journal at the beginning of every `load()`. The returned arrays above come only from the successful after-state.

- [ ] **Step 4: Implement category grid selection**

Render the expense form grid in configured order. Every button contains emoji and full name, uses `aria-pressed`, exposes a visible checkmark when selected, and applies only the validated stored color to `--category-color`. Store the last category only after a successful expense save.

- [ ] **Step 5: Implement add/edit validation**

Category rules:

```js
function categoryDraftFromForm() {
  const id = document.querySelector('#categoryId').value;
  const name = document.querySelector('#categoryName').value.trim();
  const emoji = document.querySelector('#categoryEmoji').value.trim() || '📌';
  const color = document.querySelector('#categoryColor').value.toUpperCase();
  const duplicate = state.categories.some(category => category.id !== id && category.name.localeCompare(name, 'vi', { sensitivity: 'base' }) === 0);
  return {
    valid: Boolean(name) && !duplicate && /^#[0-9A-F]{6}$/.test(color),
    error: !name ? 'Tên danh mục không được để trống.' : duplicate ? 'Tên danh mục đã tồn tại.' : '',
    value: { id: id || createId(), name, emoji, color },
  };
}
```

Editing `other` may change name, emoji, and color but never its ID. Save through `repository.saveCategories(next)` before replacing `state.categories`.

- [ ] **Step 6: Implement reordering with pointer drag and accessible buttons**

Each manager row includes a drag handle and `Đưa lên`/`Đưa xuống` buttons with category-specific accessible names. All three routes call one function:

```js
function moveCategory(fromIndex, toIndex) {
  if (fromIndex === toIndex || toIndex < 0 || toIndex >= state.categories.length) return;
  const next = [...state.categories];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  repository.saveCategories(next);
  state.categories = next;
  renderCategoryManager();
  render();
}
```

Pointer drag uses `pointerdown`, `setPointerCapture`, `pointermove`, and the row under the pointer to calculate `toIndex`; it calls `moveCategory` only on `pointerup`. Do not depend on HTML Drag and Drop because iPhone touch behavior is inconsistent.

- [ ] **Step 7: Implement category deletion UX**

- Hide deletion for `other` and state why in its row label.
- For an unused category, confirm `Xóa danh mục {name}?`.
- For an in-use category, confirm `Xóa {name} và chuyển {count} khoản chi sang Khác?`.
- Call `repository.deleteCategory(id)` only after confirmation.
- Replace both `state.expenses` and `state.categories` only from the successful repository return.
- If the last-used category was deleted, save and set `other`.

- [ ] **Step 8: Run automated and manual category checks**

Run:

```bash
npm test
python3 -m http.server 4173
```

Expected: tests PASS.

Manual checks:

1. Fresh state shows all 12 default categories in the approved order.
2. Upgraded state keeps custom and legacy `edu` categories.
3. Create, rename, recolor, re-icon, and reorder a category.
4. Duplicate names differing only by case/accents are rejected consistently.
5. Delete an in-use category and confirm its expenses now show `Khác`.
6. `Khác` cannot be deleted.

- [ ] **Step 9: Commit category management**

```bash
git add storage.js app.js styles.css tests/storage.test.js
git commit -m "feat: improve category management"
```

---

### Task 7: Replace stale caching with a controlled offline and update flow

**Files:**

- Modify: `sw.js:1-28`
- Modify: `app.js`
- Modify: `manifest.json:1-24`
- Modify: `tests/static.test.js`

**Interfaces:**

- Consumes: `state.dirtyDialogId` from Task 5.
- Produces: offline application shell, update banner, and user-controlled `SKIP_WAITING` activation.

- [ ] **Step 1: Add failing service-worker contract tests**

Append to `tests/static.test.js`:

```js
const worker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

test('service worker caches every local application module', () => {
  for (const asset of ['./index.html', './styles.css', './app.js', './logic.js', './storage.js', './manifest.json']) {
    assert.match(worker, new RegExp(asset.replaceAll('.', '\\.')));
  }
  assert.match(worker, /SKIP_WAITING/);
  assert.doesNotMatch(worker, /self\.skipWaiting\(\);/);
});

test('manifest stays standalone, portrait, and relative', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'portrait');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.background_color, '#F4F7F5');
});
```

- [ ] **Step 2: Run static tests and verify red**

Run:

```bash
node --test tests/static.test.js
```

Expected: FAIL because the old worker does not cache the new modules and activates immediately.

- [ ] **Step 3: Replace `sw.js`**

Use a controlled worker:

```js
const CACHE_NAME = 'silo-v2';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './logic.js',
  './storage.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('silo-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        return response;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});
```

- [ ] **Step 4: Implement update discovery without losing form input**

In `app.js`, register after successful app boot. Show the banner when `registration.waiting` exists or a newly installed worker reaches `installed` while a controller exists. Banner click behavior:

```js
async function activateUpdate(registration) {
  if (state.dirtyDialogId) {
    announce('Hãy lưu hoặc đóng biểu mẫu trước khi cập nhật.');
    document.getElementById(state.dirtyDialogId)?.focus();
    return;
  }
  registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
}

let reloading = false;
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (reloading) return;
  reloading = true;
  sessionStorage.setItem('silo_selected_period', state.selectedPeriodKey);
  location.reload();
});
```

At boot, restore `silo_selected_period` once when it is a valid `YYYY-MM` key, then remove it.

- [ ] **Step 5: Update the manifest**

Set:

```json
{
  "name": "Silo - Quản lý Chi tiêu",
  "short_name": "Silo",
  "description": "Theo dõi thu nhập và chi tiêu theo kỳ, lưu cục bộ trên thiết bị",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#F4F7F5",
  "theme_color": "#0B7A53",
  "orientation": "portrait",
  "icons": [
    { "src": "icons/icon-192.svg", "sizes": "192x192", "type": "image/svg+xml", "purpose": "any" },
    { "src": "icons/icon-512.svg", "sizes": "512x512", "type": "image/svg+xml", "purpose": "any" }
  ]
}
```

- [ ] **Step 6: Request persistent storage without blocking use**

After the first successful state load:

```js
if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => false);
}
```

Do not show an error when persistence is denied; local writes continue normally.

- [ ] **Step 7: Verify update and offline behavior**

Run:

```bash
npm test
python3 -m http.server 4173
```

Expected: tests PASS.

Manual browser checks:

1. Load online once, enable offline mode, reload, and verify all screens open and expense writes still work.
2. Change `CACHE_NAME` to `silo-v2-test`, reload online, and verify the update banner appears.
3. Open and edit an expense without saving; update click must not reload.
4. Save or discard the form; update click activates the worker and reloads once.
5. The previously selected period is restored after the controlled reload.

Restore `CACHE_NAME` to `silo-v2` before commit.

- [ ] **Step 8: Commit PWA behavior**

```bash
git add sw.js app.js manifest.json tests/static.test.js
git commit -m "feat: make offline updates user controlled"
```

---

### Task 8: Harden accessibility, responsive behavior, error states, and documentation

**Files:**

- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`
- Modify: `tests/static.test.js`
- Modify: `README.md`

**Interfaces:**

- Consumes: all completed Silo 2.0 functionality.
- Produces: release-candidate behavior and standalone operating documentation.

- [ ] **Step 1: Extend static security and accessibility tests**

Append to `tests/static.test.js`:

```js
test('application source does not render owner data with HTML strings', () => {
  assert.doesNotMatch(appSource, /\.innerHTML\s*=/);
  assert.doesNotMatch(appSource, /insertAdjacentHTML/);
  assert.doesNotMatch(index, /onclick=|ontouch/);
});

test('application ships no third-party runtime or analytics endpoint', () => {
  assert.doesNotMatch(index, /https?:\/\//);
  assert.doesNotMatch(appSource, /fetch\(|XMLHttpRequest|sendBeacon|analytics/i);
});

test('icon controls and destructive dialogs are named', () => {
  assert.match(index, /id="themeButton"[^>]*aria-label=/);
  assert.match(index, /id="addExpense"[^>]*aria-label=/);
  assert.match(index, /id="previousPeriod"[^>]*aria-label=/);
  assert.match(index, /id="nextPeriod"[^>]*aria-label=/);
  assert.match(index, /id="confirmDialog"[^>]*aria-labelledby=/);
});
```

- [ ] **Step 2: Run the complete suite and fix only concrete failures**

Run:

```bash
npm test
```

Expected: all tests PASS. Any failure must be resolved without weakening the assertion unless the assertion contradicts the approved design.

- [ ] **Step 3: Complete dialog focus and keyboard behavior**

Implement one dialog utility:

```js
let dialogTrigger = null;

function openDialog(dialog, trigger) {
  dialogTrigger = trigger ?? document.activeElement;
  dialog.showModal();
}

function closeDialog(dialog) {
  if (state.dirtyDialogId === dialog.id) return requestDiscard(dialog);
  dialog.close();
}

document.addEventListener('close', event => {
  if (!(event.target instanceof HTMLDialogElement)) return;
  dialogTrigger?.focus();
  dialogTrigger = null;
}, true);

document.addEventListener('cancel', event => {
  if (state.dirtyDialogId === event.target.id) {
    event.preventDefault();
    requestDiscard(event.target);
  }
}, true);
```

Native modal dialog behavior supplies focus containment. Verify close buttons, Escape, backdrop policy, submit, validation focus, and return-to-trigger behavior.

- [ ] **Step 4: Complete storage and empty-state presentation**

- Malformed financial storage: hide the app and FAB, show the exact read-only message, and perform no migration or write.
- Storage write failure: keep the active form and values, leave state/totals unchanged, and show `Không thể lưu trên iPhone. Hãy kiểm tra dung lượng và thử lại.`
- No income: show `Chưa nhập thu nhập kỳ này` and `Nhập thu nhập`.
- No transactions: show `Chưa có khoản chi trong kỳ này` and keep the FAB available.
- Missing category reference: display `Khác` without mutating the stored transaction until the user edits or a category deletion transaction runs.

- [ ] **Step 5: Finish responsive and large-text CSS**

Add exact defensive rules:

```css
.summary-amount, .summary-details dd, .expense-amount { overflow-wrap: anywhere; }
.expense-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; min-height: 64px; }
.expense-title, .expense-category { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 359px) {
  body { padding-inline: 12px; }
  .summary { padding: 16px; }
  .summary-details { grid-template-columns: 1fr; }
  .category-grid { grid-template-columns: 1fr; }
}
@media (prefers-contrast: more) {
  :root { --border: #687a72; }
  [data-theme="dark"] { --border: #b6c8c0; }
  .category-option[aria-pressed="true"] { outline: 2px solid currentColor; }
}
```

Do not truncate the lead remaining amount. Allow it to wrap or scale through `clamp()`.

- [ ] **Step 6: Write the standalone README**

Replace `README.md` with these sections and exact commands:

````markdown
# Silo

Silo là PWA quản lý thu nhập và chi tiêu cá nhân theo kỳ. Mọi giao dịch được nhập thủ công và lưu trong bộ nhớ trình duyệt trên thiết bị; GitHub Pages chỉ lưu mã nguồn.

## Chạy trên máy Mac

```bash
cd silo-myassitant
python3 -m http.server 4173
```

Mở `http://localhost:4173/`.

## Kiểm thử

```bash
npm test
```

Không cần chạy `npm install`; dự án không có dependency.

## Cài trên iPhone

1. Mở URL GitHub Pages bằng Safari.
2. Chọn Chia sẻ.
3. Chọn Thêm vào Màn hình chính.
4. Mở Silo một lần khi có mạng để lưu bộ ứng dụng dùng offline.

## Dữ liệu và quyền riêng tư

- Dữ liệu chi tiêu nằm trong vùng lưu trữ của Silo trên thiết bị.
- Silo không kết nối ngân hàng, không có analytics và không gửi giao dịch lên GitHub.
- Phiên bản này không có xuất, sao lưu hoặc khôi phục dữ liệu. Xóa web app hoặc dữ liệu website có thể làm mất dữ liệu.

## Triển khai

GitHub Pages phát hành từ nhánh `main`. Sau khi kiểm thử, đẩy commit lên `main`, mở URL Pages khi có mạng và chấp nhận banner cập nhật của Silo.
````

- [ ] **Step 7: Run automated verification**

Run:

```bash
npm test
git diff --check
git status --short
```

Expected: tests PASS, `git diff --check` prints nothing, and status lists only intended Task 8 files.

- [ ] **Step 8: Run the Impeccable mechanical UI detector once**

Run from the repository root after all UI edits are present:

```bash
node /Users/vuhaianh/.agents/skills/impeccable/scripts/detect.mjs --json index.html styles.css app.js
```

Expected: JSON report. Fix concrete accessibility, responsive, typography, token, or anti-pattern findings in one batch. Record any intentionally accepted finding in the implementation handoff with the exact rule and reason. Do not run the detector a second time.

- [ ] **Step 9: Perform one bounded visual review and one confirmation pass**

Start the local server and inspect the following matrix in Safari Responsive Design Mode or an equivalent browser viewport tool:

| Width | Theme | Required state |
|---:|---|---|
| 375 | Light | Empty period and no income |
| 375 | Dark | Expense form with numeric keyboard-equivalent viewport |
| 390 | Light | Typical data at 50% used |
| 390 | Dark | Warning at 80% used |
| 430 | Light | Exceeded state and large amounts |
| 430 | Dark | Long titles and category management |

Also inspect 320 px, 200% browser text zoom, `prefers-reduced-motion`, and `prefers-contrast: more`. In the first pass, list every material defect; fix all in one batch. In the confirmation pass, verify only those fixes and stop polishing.

- [ ] **Step 10: Commit the hardened release candidate**

```bash
git add index.html styles.css app.js tests/static.test.js README.md
git commit -m "docs: finish Silo 2.0 release guidance"
```

---

### Task 9: Run migration, iPhone, offline, and release acceptance

**Files:**

- Modify only when a release-blocking verification failure is found.
- Verify: all source and test files.

**Interfaces:**

- Consumes: completed release candidate.
- Produces: evidence that Silo 2.0 is safe to push to GitHub Pages.

- [ ] **Step 1: Create two local acceptance profiles**

Use browser developer tools, not source-code fixtures:

1. Fresh profile: clear only the local development origin's storage and reload.
2. Upgrade profile: set `silo_expenses` and `silo_categories` to a copy of valid Silo 1 data that includes `edu` and one custom category, then reload.

Never clear the production GitHub Pages origin during this test.

- [ ] **Step 2: Verify the fresh profile**

Confirm all 12 defaults in order:

```text
Ăn uống; Đi lại; Nhà ở; Hóa đơn & dịch vụ; Mua sắm; Sức khỏe;
Đầu tư; Tiết kiệm; Phát triển bản thân; Giải trí; Gia đình & quà tặng; Khác
```

Set start day 25, enter income 5,000,000, add spending 1,000,000 and saving 1,000,000, and verify:

```text
Đã dùng: 2.000.000 ₫
Còn lại: 3.000.000 ₫
```

- [ ] **Step 3: Verify the upgrade profile**

Confirm:

- Every old expense retains exact ID, title, amount, date, and category ID.
- Custom category remains once.
- Legacy `edu` remains once and its old expense still resolves.
- New default IDs are added once.
- Old unmodified `Hoá đơn` becomes `Hóa đơn & dịch vụ`.
- Reloading again creates no duplicates.

- [ ] **Step 4: Verify period boundaries and start-day changes**

Test start days 1, 25, 28, 29, 30, and 31 across February in a leap and non-leap year. Confirm date ranges are contiguous, labels use `Kỳ tháng 9–10` style, and changing the start day moves only group membership—not transaction data.

- [ ] **Step 5: Verify real iPhone behavior**

On the target iPhone:

1. Open the local/staging URL in Safari.
2. Add to Home Screen and launch standalone.
3. Confirm safe areas, system/light/dark modes, status-bar color, and 44 px targets.
4. Tap amount fields and confirm the iPhone numeric keyboard appears.
5. Confirm `000` remains visible/reachable and the save action is not permanently obscured.
6. Add, edit, filter, and delete expenses.
7. Add, edit, reorder, and delete a category.
8. Relaunch offline and confirm data and app shell remain available.

- [ ] **Step 6: Run the final command gate**

Run:

```bash
npm test
git diff --check
git status --short
git log --oneline --decorate -10
```

Expected: all tests PASS, no whitespace errors, clean working tree, and one focused commit per completed task.

- [ ] **Step 7: Review the branch before any remote write**

Run:

```bash
git diff 29d6620..HEAD --stat
git diff 29d6620..HEAD -- index.html styles.css app.js logic.js storage.js sw.js manifest.json package.json README.md
```

Expected: only the planned Silo 2.0 files changed; no financial sample data, secrets, absolute local paths in shipped web files, external scripts, or analytics endpoints.

- [ ] **Step 8: Push only with explicit owner approval**

Do not push as part of plan execution unless the owner explicitly authorizes the remote write. When authorized:

```bash
git push origin main
```

Expected: GitHub accepts the commits. Wait for GitHub Pages deployment, then open `https://vuhaianh210.github.io/silo-myassitant/`, accept Silo's update banner, and repeat the short production smoke check: launch, period label, income, existing expenses, one create/edit/delete cycle, theme, and offline relaunch.

## Final Definition of Done

- All automated tests pass with no dependency installation.
- Existing valid financial data migrates without mutation or duplication.
- Malformed financial data enters a read-only state and is never silently overwritten.
- Period math is correct for custom start days, month lengths, leap years, and year boundaries.
- Income, spending, saving, investment, remaining money, percentage, and status are correct.
- Amount inputs open the numeric keyboard and `000` behaves exactly as specified.
- All 12 default categories are recognizable, editable, reorderable, and safely deletable except protected `other`.
- Light, dark, and system themes work without losing user preference.
- User text is rendered safely without HTML interpolation.
- Dialogs, focus, errors, live feedback, large text, safe areas, and touch targets meet the specification.
- Offline launch and controlled updates work without discarding unsaved form input.
- The repository is clean, documentation is complete, and no push occurs without explicit approval.
