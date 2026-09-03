const VND = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

function parsePeriodKey(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new TypeError(`Invalid period key: ${key}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new TypeError(`Invalid period key: ${key}`);
  return { year, month };
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

function previousDate(dateKey) {
  const { year, month, day } = parseDateKey(dateKey);
  if (day > 1) return `${year}-${String(month).padStart(2, '0')}-${String(day - 1).padStart(2, '0')}`;
  const previous = parsePeriodKey(monthKey(year, month - 1));
  return `${previous.year}-${String(previous.month).padStart(2, '0')}-${daysInMonth(previous.year, previous.month)}`;
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

export function periodBounds(periodKey, startDay) {
  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 31) {
    throw new TypeError('startDay must be an integer from 1 through 31');
  }
  const startDate = startDateForPeriod(periodKey, startDay);
  const nextStartDate = startDateForPeriod(shiftPeriodKey(periodKey, 1), startDay);
  const endDate = previousDate(nextStartDate);
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const label = start.month === end.month && start.year === end.year
    ? `Kỳ tháng ${start.month}`
    : start.year === end.year
      ? `Kỳ tháng ${start.month}–${end.month}`
      : `Kỳ tháng ${start.month}/${start.year}–${end.month}/${end.year}`;
  return { key: periodKey, startDate, nextStartDate, endDate, label, rangeLabel: `${shortDate(startDate)}–${shortDate(endDate)}` };
}

export function periodKeyForDate(dateKey, startDay) {
  parseDateKey(dateKey);
  const { year, month } = parseDateKey(dateKey);
  const candidate = monthKey(year, month);
  return dateKey >= startDateForPeriod(candidate, startDay) ? candidate : shiftPeriodKey(candidate, -1);
}

export function expensesForPeriod(expenses, bounds, categoryId = 'all') {
  return expenses
    .filter(expense => expense.date >= bounds.startDate && expense.date < bounds.nextStartDate)
    .filter(expense => categoryId === 'all' || expense.catId === categoryId)
    .toSorted((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
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

export function appendTripleZero(value) {
  const digits = normalizeMoneyDigits(value);
  return digits && digits !== '0' ? `${digits}000` : '';
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
