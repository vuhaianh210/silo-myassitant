import { isValidDateKey, isValidPeriodKey, shiftPeriodKey } from './logic.js';

const KEYS = Object.freeze({
  expenses: 'silo_expenses', categories: 'silo_categories', incomes: 'silo_period_incomes',
  endDay: 'silo_cycle_end_day', anchor: 'silo_cycle_anchor', theme: 'silo_theme',
  lastCategory: 'silo_last_category', transaction: 'silo_pending_transaction',
});
const LEGACY_START_DAY = 'silo_cycle_start_day';
const MAX_DAY = 31;
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
  try { return { ok: true, value: JSON.parse(raw) }; }
  catch { return { ok: false, code: 'MALFORMED_DATA', key }; }
}
function validExpense(item) {
  return item && typeof item.id === 'string' && item.id && typeof item.title === 'string' && item.title.trim() && item.title.length <= 80 && Number.isSafeInteger(item.amount) && item.amount > 0 && isValidDateKey(item.date) && typeof item.catId === 'string' && item.catId;
}
function validCategory(item) {
  return item && typeof item.id === 'string' && item.id && typeof item.name === 'string' && item.name.trim() && typeof item.emoji === 'string' && item.emoji && /^#[0-9A-Fa-f]{6}$/.test(item.color);
}
function validIncomeEntry(entry) { return entry && typeof entry.id === 'string' && entry.id.trim() && typeof entry.title === 'string' && entry.title === entry.title.trim() && entry.title.length > 0 && entry.title.length <= 80 && Number.isSafeInteger(entry.amount) && entry.amount > 0; }
function validIncomeEntries(entries) {
  if (!Array.isArray(entries) || !entries.length || !entries.every(validIncomeEntry) || new Set(entries.map(entry => entry.id)).size !== entries.length) return false;
  return Number.isSafeInteger(entries.reduce((sum, entry) => sum + entry.amount, 0));
}
function validIncomes(value) {
  return value && !Array.isArray(value) && typeof value === 'object' && Object.entries(value).every(([key, income]) => isValidPeriodKey(key) && (Number.isSafeInteger(income) && income > 0 || validIncomeEntries(income)));
}
function normalizeIncomeEntries(incomes) {
  let migrated = false;
  const periodIncomeEntries = Object.fromEntries(Object.entries(incomes).map(([periodKey, income]) => {
    if (Array.isArray(income)) return [periodKey, income.map(entry => ({ ...entry }))];
    migrated = true;
    return [periodKey, [{ id: `legacy-${periodKey}`, title: 'Thu nhập', amount: income }]];
  }));
  const periodIncomes = Object.fromEntries(Object.entries(periodIncomeEntries).map(([periodKey, entries]) => [periodKey, entries.reduce((sum, entry) => sum + entry.amount, 0)]));
  return { periodIncomeEntries, periodIncomes, migrated };
}
function migrateCategories(categories) {
  const next = categories.map(category => ({ ...category }));
  const bill = next.find(category => category.id === 'bill');
  if (bill && ['Hóa đơn', 'Hoá đơn'].includes(bill.name)) Object.assign(bill, { name: 'Hóa đơn & dịch vụ', emoji: '🧾' });
  for (const category of DEFAULT_CATEGORIES) if (!next.some(item => item.id === category.id)) next.push({ ...category });
  return next;
}
function storageError(cause) { const error = new Error('Unable to write local storage', { cause }); error.code = 'STORAGE_WRITE_FAILED'; return error; }
function restoreRaw(storage, key, raw) { if (raw === null) storage.removeItem(key); else storage.setItem(key, raw); }
function recoverPendingTransaction(storage) {
  const raw = storage.getItem(KEYS.transaction);
  if (raw === null) return { ok: true };
  let pending;
  try { pending = JSON.parse(raw); } catch { return { ok: false, code: 'MALFORMED_DATA', key: KEYS.transaction }; }
  if (pending && pending.type === 'migrate-cycle') {
    if (!Object.hasOwn(pending, 'incomesBefore')) return { ok: false, code: 'MALFORMED_DATA', key: KEYS.transaction };
    try {
      if (storage.getItem(LEGACY_START_DAY) !== null) { restoreRaw(storage, KEYS.incomes, pending.incomesBefore); storage.removeItem(KEYS.endDay); }
      storage.removeItem(KEYS.transaction);
      return { ok: true };
    } catch (cause) { throw storageError(cause); }
  }
  if (!pending || pending.type !== 'delete-category' || !Object.hasOwn(pending, 'expensesBefore') || !Object.hasOwn(pending, 'categoriesBefore')) return { ok: false, code: 'MALFORMED_DATA', key: KEYS.transaction };
  try { restoreRaw(storage, KEYS.expenses, pending.expensesBefore); restoreRaw(storage, KEYS.categories, pending.categoriesBefore); storage.removeItem(KEYS.transaction); return { ok: true }; }
  catch (cause) { throw storageError(cause); }
}

export function createRepository(storage) {
  let current = null;
  function write(key, value) {
    try { storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); }
    catch (cause) { throw storageError(cause); }
  }
  function requireLoaded() { if (!current) throw new Error('Repository must be loaded first'); }
  function migrateCycleSettings(incomes) {
    const legacy = storage.getItem(LEGACY_START_DAY);
    if (legacy === null) return { ok: true, incomes };
    const startDay = Number(legacy);
    if (!Number.isInteger(startDay) || startDay < 1 || startDay > MAX_DAY) {
      try { storage.removeItem(LEGACY_START_DAY); } catch { /* nothing to undo; the value is invalid and will be re-dropped next load */ }
      return { ok: true, incomes };
    }
    const endDay = startDay === 1 ? MAX_DAY : startDay - 1;
    let next = incomes;
    try {
      write(KEYS.transaction, { type: 'migrate-cycle', startDay, incomesBefore: storage.getItem(KEYS.incomes) });
      if (startDay >= 2) {
        next = Object.fromEntries(Object.entries(incomes).map(([key, amount]) => [shiftPeriodKey(key, 1), amount]));
        write(KEYS.incomes, next);
      }
      write(KEYS.endDay, String(endDay));
      storage.removeItem(LEGACY_START_DAY);
      storage.removeItem(KEYS.transaction);
    } catch (cause) {
      return { ok: false, code: 'STORAGE_WRITE_FAILED', key: KEYS.transaction };
    }
    return { ok: true, incomes: next };
  }
  function load() {
    const recovery = recoverPendingTransaction(storage); if (!recovery.ok) return recovery;
    const results = [parseJson(storage, KEYS.expenses, []), parseJson(storage, KEYS.categories, []), parseJson(storage, KEYS.incomes, {})];
    for (const result of results) if (!result.ok) return result;
    const [expensesResult, categoriesResult, incomesResult] = results;
    if (!Array.isArray(expensesResult.value) || !expensesResult.value.every(validExpense)) return { ok: false, code: 'MALFORMED_DATA', key: KEYS.expenses };
    if (!Array.isArray(categoriesResult.value) || !categoriesResult.value.every(validCategory)) return { ok: false, code: 'MALFORMED_DATA', key: KEYS.categories };
    if (!validIncomes(incomesResult.value)) return { ok: false, code: 'MALFORMED_DATA', key: KEYS.incomes };
    const cycle = migrateCycleSettings(incomesResult.value);
    if (!cycle.ok) return cycle;
    const incomes = normalizeIncomeEntries(cycle.incomes);
    if (incomes.migrated) {
      try { write(KEYS.incomes, incomes.periodIncomeEntries); }
      catch { return { ok: false, code: 'STORAGE_WRITE_FAILED', key: KEYS.incomes }; }
    }
    const rawEndDay = storage.getItem(KEYS.endDay);
    const endDay = rawEndDay === null ? MAX_DAY : Number(rawEndDay);
    const anchor = storage.getItem(KEYS.anchor);
    current = { expenses: structuredClone(expensesResult.value), categories: migrateCategories(categoriesResult.value), periodIncomeEntries: incomes.periodIncomeEntries, periodIncomes: incomes.periodIncomes, cycleEndDay: Number.isInteger(endDay) && endDay >= 1 && endDay <= MAX_DAY ? endDay : MAX_DAY, anchor: isValidDateKey(anchor) ? anchor : null, theme: THEMES.has(storage.getItem(KEYS.theme)) ? storage.getItem(KEYS.theme) : 'system', lastCategory: storage.getItem(KEYS.lastCategory) || 'food' };
    write(KEYS.categories, current.categories);
    return { ok: true, state: structuredClone(current) };
  }
  function saveExpenses(expenses) { requireLoaded(); if (!Array.isArray(expenses) || !expenses.every(validExpense)) throw new TypeError('Invalid expenses'); const next = structuredClone(expenses); write(KEYS.expenses, next); current.expenses = next; }
  function saveCategories(categories) { requireLoaded(); if (!Array.isArray(categories) || !categories.every(validCategory)) throw new TypeError('Invalid categories'); if (!categories.some(category => category.id === 'other')) throw new TypeError('Category other is required'); const next = structuredClone(categories); write(KEYS.categories, next); current.categories = next; }
  function savePeriodIncomeEntries(periodKey, entries) {
    requireLoaded();
    if (!isValidPeriodKey(periodKey) || !Array.isArray(entries) || (entries.length && !validIncomeEntries(entries))) throw new TypeError('Invalid income entries');
    const nextEntries = { ...current.periodIncomeEntries };
    const nextIncomes = { ...current.periodIncomes };
    const total = entries.length ? entries.reduce((sum, entry) => sum + entry.amount, 0) : null;
    if (entries.length) { nextEntries[periodKey] = structuredClone(entries); nextIncomes[periodKey] = total; }
    else { delete nextEntries[periodKey]; delete nextIncomes[periodKey]; }
    write(KEYS.incomes, nextEntries);
    current.periodIncomeEntries = nextEntries;
    current.periodIncomes = nextIncomes;
    return total;
  }
  function savePeriodIncome(periodKey, amount) {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new TypeError('Income must be a positive safe integer');
    return savePeriodIncomeEntries(periodKey, [{ id: `legacy-${periodKey}`, title: 'Thu nhập', amount }]);
  }
  function saveCycleEndDay(day) { requireLoaded(); if (!Number.isInteger(day) || day < 1 || day > MAX_DAY) throw new TypeError('End day must be 1 through 31'); write(KEYS.endDay, String(day)); current.cycleEndDay = day; }
  function saveAnchor(dateKey) { requireLoaded(); if (dateKey !== null && !isValidDateKey(dateKey)) throw new TypeError('Invalid anchor'); if (dateKey === null) storage.removeItem(KEYS.anchor); else write(KEYS.anchor, dateKey); current.anchor = dateKey; }
  function saveTheme(theme) { requireLoaded(); if (!THEMES.has(theme)) throw new TypeError('Invalid theme'); write(KEYS.theme, theme); current.theme = theme; }
  function saveLastCategory(categoryId) { requireLoaded(); if (typeof categoryId !== 'string' || !categoryId) throw new TypeError('Invalid category id'); write(KEYS.lastCategory, categoryId); current.lastCategory = categoryId; }
  function deleteCategory(categoryId) {
    requireLoaded();
    if (categoryId === 'other') throw new TypeError('Category other cannot be deleted');
    if (!current.categories.some(category => category.id === categoryId)) throw new TypeError('Category does not exist');
    const transaction = { type: 'delete-category', expensesBefore: storage.getItem(KEYS.expenses), categoriesBefore: storage.getItem(KEYS.categories) };
    const nextExpenses = current.expenses.map(expense => expense.catId === categoryId ? { ...expense, catId: 'other' } : { ...expense });
    const nextCategories = current.categories.filter(category => category.id !== categoryId).map(category => ({ ...category }));
    write(KEYS.transaction, transaction);
    try { write(KEYS.expenses, nextExpenses); write(KEYS.categories, nextCategories); storage.removeItem(KEYS.transaction); }
    catch (cause) { try { restoreRaw(storage, KEYS.expenses, transaction.expensesBefore); restoreRaw(storage, KEYS.categories, transaction.categoriesBefore); storage.removeItem(KEYS.transaction); } catch (restoreCause) { throw storageError(restoreCause); } throw cause?.code === 'STORAGE_WRITE_FAILED' ? cause : storageError(cause); }
    current.expenses = nextExpenses; current.categories = nextCategories;
    return structuredClone({ expenses: nextExpenses, categories: nextCategories });
  }
  return { load, saveExpenses, saveCategories, savePeriodIncome, savePeriodIncomeEntries, saveCycleEndDay, saveAnchor, saveTheme, saveLastCategory, deleteCategory };
}
