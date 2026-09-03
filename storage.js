const KEYS = Object.freeze({
  expenses: 'silo_expenses', categories: 'silo_categories', incomes: 'silo_period_incomes',
  cycleStartDay: 'silo_cycle_start_day', theme: 'silo_theme', lastCategory: 'silo_last_category',
  schema: 'silo_schema_version', transaction: 'silo_pending_transaction',
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

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function parseJson(storage, key, fallback) {
  const raw = storage.getItem(key);
  if (raw === null) return { ok: true, value: fallback };
  try { return { ok: true, value: JSON.parse(raw) }; }
  catch { return { ok: false, code: 'MALFORMED_DATA', key }; }
}
function validDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(year, month, 0).getDate();
}
function validExpense(item) {
  return item && typeof item.id === 'string' && item.id && typeof item.title === 'string' && item.title.trim() && item.title.length <= 80 && Number.isSafeInteger(item.amount) && item.amount > 0 && validDateKey(item.date) && typeof item.catId === 'string' && item.catId;
}
function validCategory(item) {
  return item && typeof item.id === 'string' && item.id && typeof item.name === 'string' && item.name.trim() && typeof item.emoji === 'string' && item.emoji && /^#[0-9A-Fa-f]{6}$/.test(item.color);
}
function validIncomes(value) {
  return value && !Array.isArray(value) && typeof value === 'object' && Object.entries(value).every(([key, amount]) => /^\d{4}-(0[1-9]|1[0-2])$/.test(key) && Number.isSafeInteger(amount) && amount > 0);
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
  function load() {
    const recovery = recoverPendingTransaction(storage); if (!recovery.ok) return recovery;
    const results = [parseJson(storage, KEYS.expenses, []), parseJson(storage, KEYS.categories, []), parseJson(storage, KEYS.incomes, {})];
    for (const result of results) if (!result.ok) return result;
    const [expensesResult, categoriesResult, incomesResult] = results;
    if (!Array.isArray(expensesResult.value) || !expensesResult.value.every(validExpense)) return { ok: false, code: 'MALFORMED_DATA', key: KEYS.expenses };
    if (!Array.isArray(categoriesResult.value) || !categoriesResult.value.every(validCategory)) return { ok: false, code: 'MALFORMED_DATA', key: KEYS.categories };
    if (!validIncomes(incomesResult.value)) return { ok: false, code: 'MALFORMED_DATA', key: KEYS.incomes };
    const day = Number(storage.getItem(KEYS.cycleStartDay));
    current = { expenses: clone(expensesResult.value), categories: migrateCategories(categoriesResult.value), periodIncomes: clone(incomesResult.value), cycleStartDay: Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1, theme: THEMES.has(storage.getItem(KEYS.theme)) ? storage.getItem(KEYS.theme) : 'system', lastCategory: storage.getItem(KEYS.lastCategory) || 'food', schemaVersion: SCHEMA_VERSION };
    write(KEYS.categories, current.categories); write(KEYS.schema, String(SCHEMA_VERSION));
    return { ok: true, state: clone(current) };
  }
  function saveExpenses(expenses) { requireLoaded(); if (!Array.isArray(expenses) || !expenses.every(validExpense)) throw new TypeError('Invalid expenses'); const next = clone(expenses); write(KEYS.expenses, next); current.expenses = next; }
  function saveCategories(categories) { requireLoaded(); if (!Array.isArray(categories) || !categories.every(validCategory)) throw new TypeError('Invalid categories'); if (!categories.some(category => category.id === 'other')) throw new TypeError('Category other is required'); const next = clone(categories); write(KEYS.categories, next); current.categories = next; }
  function savePeriodIncome(periodKey, amount) { requireLoaded(); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey) || !Number.isSafeInteger(amount) || amount <= 0) throw new TypeError('Income must be a positive safe integer'); const next = { ...current.periodIncomes, [periodKey]: amount }; write(KEYS.incomes, next); current.periodIncomes = next; }
  function saveCycleStartDay(day) { requireLoaded(); if (!Number.isInteger(day) || day < 1 || day > 31) throw new TypeError('Start day must be 1 through 31'); write(KEYS.cycleStartDay, String(day)); current.cycleStartDay = day; }
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
    return clone({ expenses: nextExpenses, categories: nextCategories });
  }
  return { load, saveExpenses, saveCategories, savePeriodIncome, saveCycleStartDay, saveTheme, saveLastCategory, deleteCategory };
}
