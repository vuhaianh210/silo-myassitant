import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendTripleZero,
  calculatePeriodSummary,
  expensesBeforeAnchor,
  expensesForPeriod,
  formatMoneyInput,
  formatVnd,
  isValidDateKey,
  isValidPeriodKey,
  normalizeMoneyDigits,
  parsePositiveAmount,
  periodBounds,
  periodKeyForDate,
  shiftPeriodKey,
  swipeTarget,
} from '../logic.js';

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

test('a date resolves to the period that contains it', () => {
  assert.equal(periodKeyForDate('2026-10-10', 10), '2026-10');
  assert.equal(periodKeyForDate('2026-10-11', 10), '2026-11');
  assert.equal(periodKeyForDate('2026-09-24', 24), '2026-09');
  assert.equal(periodKeyForDate('2026-09-25', 24), '2026-10');
  assert.equal(periodKeyForDate('2026-10-24', 24), '2026-10');
  assert.equal(periodKeyForDate('2026-10-25', 24), '2026-11');
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

test('period key validation rejects malformed keys', () => {
  assert.equal(isValidPeriodKey('2026-09'), true);
  assert.equal(isValidPeriodKey('2026-13'), false);
  assert.equal(isValidPeriodKey(null), false);
});

test('releasing a row drag decides reveal or spring back', () => {
  assert.equal(swipeTarget(-60, 0), 'open');
  assert.equal(swipeTarget(-39, 0), 'closed');
  assert.equal(swipeTarget(-10, -1), 'open');
  assert.equal(swipeTarget(-60, 1), 'closed');
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
  expensesForPeriod(source, periodBounds('2026-10', 24));
  assert.deepEqual(source, before);
});

test('savings and investment are ordinary expenses in totals', () => {
  const expenses = [{ amount: 1_000_000, catId: 'saving' }, { amount: 500_000, catId: 'investment' }];
  assert.equal(calculatePeriodSummary(5_000_000, expenses).remaining, 3_500_000);
});
