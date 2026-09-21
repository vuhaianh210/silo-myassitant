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
  assert.equal(result.state.cycleEndDay, 31);
  assert.equal(result.state.anchor, null);
  assert.equal(result.state.theme, 'system');
  assert.equal(result.state.periodIncomes['2026-09'], undefined);
  assert.deepEqual(result.state.categories.map(category => category.id), DEFAULT_CATEGORIES.map(category => category.id));
});

test('migration preserves expenses, custom categories, and legacy edu', () => {
  const expenses = [{ id: 'x', title: 'Sách', amount: 90000, date: '2026-09-03', catId: 'edu' }];
  const storage = memoryStorage({ silo_expenses: JSON.stringify(expenses), silo_categories: JSON.stringify(oldCategories) });
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

test('invalid theme and end day safely fall back', () => {
  const result = createRepository(memoryStorage({ silo_theme: 'neon', silo_cycle_start_day: '99' })).load();
  assert.equal(result.state.theme, 'system');
  assert.equal(result.state.cycleEndDay, 31);
});

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

test('period income persists as a positive safe integer', () => {
  const storage = memoryStorage();
  const repository = createRepository(storage);
  repository.load();
  repository.savePeriodIncome('2026-09', 5_000_000);
  assert.equal(createRepository(storage).load().state.periodIncomes['2026-09'], 5_000_000);
  assert.throws(() => repository.savePeriodIncome('2026-09', 0), /positive safe integer/);
});

test('deleting an in-use category reassigns expenses to other', () => {
  const storage = memoryStorage({ silo_expenses: JSON.stringify([{ id: 'x', title: 'Quỹ', amount: 100, date: '2026-09-03', catId: 'investment' }]), silo_categories: JSON.stringify(DEFAULT_CATEGORIES) });
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
  const base = memoryStorage({ silo_expenses: JSON.stringify([{ id: 'x', title: 'Quỹ', amount: 100, date: '2026-09-03', catId: 'investment' }]), silo_categories: JSON.stringify(DEFAULT_CATEGORIES) });
  let categoryFailuresRemaining = 0;
  const failing = { ...base, setItem(key, value) { if (categoryFailuresRemaining > 0 && key === 'silo_categories') { categoryFailuresRemaining -= 1; throw new Error('disk full'); } base.setItem(key, value); } };
  const repository = createRepository(failing);
  repository.load();
  categoryFailuresRemaining = 2;
  assert.throws(() => repository.deleteCategory('investment'));
  const recovered = createRepository(base).load();
  assert.equal(recovered.ok, true);
  assert.equal(recovered.state.expenses[0].catId, 'investment');
  assert.equal(recovered.state.categories.some(category => category.id === 'investment'), true);
});
