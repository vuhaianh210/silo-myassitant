const VND = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

function parsePeriodKey(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new TypeError(`Invalid period key: ${key}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new TypeError(`Invalid period key: ${key}`);
  return { year, month };
}

export function isValidPeriodKey(value) {
  try { parsePeriodKey(value); return true; } catch { return false; }
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
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
  try { parseDateKey(value); return true; } catch { return false; }
}

function monthKey(year, month) {
  const index = year * 12 + month - 1;
  const normalizedYear = Math.floor(index / 12);
  const normalizedMonth = ((index % 12) + 12) % 12 + 1;
  return `${normalizedYear}-${String(normalizedMonth).padStart(2, '0')}`;
}

function startDateForPeriod(periodKey, startDay) {
  const { year, month } = parsePeriodKey(periodKey);
  const day = Math.min(startDay, daysInMonth(year, month));
  return `${periodKey}-${String(day).padStart(2, '0')}`;
}

function nextDay(dateKey) {
  const { year, month, day } = parseDateKey(dateKey);
  if (day < daysInMonth(year, month)) return `${year}-${String(month).padStart(2, '0')}-${String(day + 1).padStart(2, '0')}`;
  const next = parsePeriodKey(monthKey(year, month + 1));
  return `${next.year}-${String(next.month).padStart(2, '0')}-01`;
}

function assertEndDay(endDay) {
  if (!Number.isInteger(endDay) || endDay < 1 || endDay > 31) throw new TypeError('endDay must be an integer from 1 through 31');
}

function shortDate(dateKey) {
  const { month, day } = parseDateKey(dateKey);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

export function shiftPeriodKey(periodKey, delta) {
  const { year, month } = parsePeriodKey(periodKey);
  if (!Number.isInteger(delta)) throw new TypeError('delta must be an integer');
  return monthKey(year, month + delta);
}

export function periodBounds(periodKey, endDay, anchor = null) {
  assertEndDay(endDay);
  const endDate = startDateForPeriod(periodKey, endDay);
  const chainStartDate = nextDay(startDateForPeriod(shiftPeriodKey(periodKey, -1), endDay));
  const startDate = anchor !== null && anchor !== '' && chainStartDate < anchor && anchor <= endDate ? anchor : chainStartDate;
  return { key: periodKey, startDate, endDate, rangeLabel: `${shortDate(startDate)}–${shortDate(endDate)}` };
}

export function periodKeyForDate(dateKey, endDay) {
  assertEndDay(endDay);
  const { year, month } = parseDateKey(dateKey);
  const candidate = monthKey(year, month);
  return dateKey > startDateForPeriod(candidate, endDay) ? shiftPeriodKey(candidate, 1) : candidate;
}

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

export function calculatePeriodSummary(income, expenses) {
  const spent = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  if (income === null) return { income: null, spent, remaining: null, percentageUsed: null, status: 'missing' };
  const remaining = income - spent;
  const percentageUsed = income > 0 ? (spent / income) * 100 : null;
  const status = remaining <= 0 ? 'exceeded' : percentageUsed >= 80 ? 'warning' : 'ok';
  return { income, spent, remaining, percentageUsed, status };
}

export function normalizeMoneyDigits(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.replace(/^0+(?=\d)/, '');
}

export function parsePositiveAmount(value) {
  const digits = normalizeMoneyDigits(value);
  const amount = Number(digits);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function formatMoneyInput(value) {
  const digits = normalizeMoneyDigits(value);
  return digits ? VND.format(Number(digits)) : '';
}

export function formatVnd(value) {
  return `${VND.format(value)}\u00a0₫`;
}

const SWIPE_REVEAL_PX = 40;
const SWIPE_FLING_PX_PER_MS = 0.5;

export function swipeTarget(deltaX, velocityX = 0) {
  if (velocityX <= -SWIPE_FLING_PX_PER_MS) return 'open';
  if (velocityX >= SWIPE_FLING_PX_PER_MS) return 'closed';
  return deltaX <= -SWIPE_REVEAL_PX ? 'open' : 'closed';
}
