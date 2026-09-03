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
    key: '2026-09', startDate: '2026-09-01', nextStartDate: '2026-10-01', endDate: '2026-09-30',
    label: 'Kỳ tháng 9', rangeLabel: '01/09–30/09',
  });
});

test('period starting on day 25 crosses two months', () => {
  assert.deepEqual(periodBounds('2026-09', 25), {
    key: '2026-09', startDate: '2026-09-25', nextStartDate: '2026-10-25', endDate: '2026-10-24',
    label: 'Kỳ tháng 9–10', rangeLabel: '25/09–24/10',
  });
});

test('period day 31 clamps to the last day and remains contiguous', () => {
  assert.deepEqual(periodBounds('2027-01', 31), {
    key: '2027-01', startDate: '2027-01-31', nextStartDate: '2027-02-28', endDate: '2027-02-27',
    label: 'Kỳ tháng 1–2', rangeLabel: '31/01–27/02',
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
    income: null, spent: 5_250_000, remaining: null, percentageUsed: null, status: 'missing',
  });
  assert.deepEqual(calculatePeriodSummary(5_000_000, expenses), {
    income: 5_000_000, spent: 5_250_000, remaining: -250_000, percentageUsed: 105, status: 'exceeded',
  });
});

test('money input strips non-digits, formats VND, and appends 000', () => {
  assert.equal(normalizeMoneyDigits(' 5.000 ₫ '), '5000');
  assert.equal(normalizeMoneyDigits('00050'), '50');
  assert.equal(formatMoneyInput('5000000'), '5.000.000');
  assert.equal(formatVnd(5_000_000), '5.000.000\u00a0₫');
  assert.equal(appendTripleZero(''), '');
  assert.equal(appendTripleZero('0'), '');
  assert.equal(appendTripleZero('5'), '5000');
  assert.equal(appendTripleZero('50.000'), '50000000');
  assert.equal(parsePositiveAmount('5.000.000'), 5_000_000);
  assert.equal(parsePositiveAmount('0'), null);
  assert.equal(parsePositiveAmount('-2'), 2);
});

test('summary changes status exactly at 80 and 100 percent', () => {
  assert.equal(calculatePeriodSummary(100, [{ amount: 79 }]).status, 'ok');
  assert.equal(calculatePeriodSummary(100, [{ amount: 80 }]).status, 'warning');
  assert.equal(calculatePeriodSummary(100, [{ amount: 100 }]).status, 'exceeded');
  assert.equal(calculatePeriodSummary(100, [{ amount: 101 }]).status, 'exceeded');
});

test('expense filtering does not mutate the source array', () => {
  const source = [{ id: 'a', amount: 1, date: '2026-09-26', catId: 'food' }, { id: 'b', amount: 2, date: '2026-09-25', catId: 'saving' }];
  const before = structuredClone(source);
  expensesForPeriod(source, periodBounds('2026-09', 25));
  assert.deepEqual(source, before);
});

test('savings and investment are ordinary expenses in totals', () => {
  const expenses = [{ amount: 1_000_000, catId: 'saving' }, { amount: 500_000, catId: 'investment' }];
  assert.equal(calculatePeriodSummary(5_000_000, expenses).remaining, 3_500_000);
});
