import { createRepository } from './storage.js';
import { appendTripleZero, calculatePeriodSummary, expensesBeforeAnchor, expensesForPeriod, formatMoneyInput, formatVnd, isValidDateKey, isValidPeriodKey, parsePositiveAmount, periodBounds, periodKeyForDate, shiftPeriodKey, swipeTarget } from './logic.js';

const repository = createRepository(localStorage);
const loaded = repository.load();
const $ = selector => document.querySelector(selector);
const STATUS_COPY = { missing: 'Chưa nhập thu nhập kỳ này', ok: 'Còn trong kế hoạch', warning: 'Sắp dùng hết thu nhập kỳ này', exceeded: 'Đã chi vượt thu nhập kỳ này' };
let state;
let editingExpenseId = null;
let dirtyDialogId = null;
let swipeRow = null;
let swipeGesture = null;
const systemTheme = matchMedia('(prefers-color-scheme: dark)');

function todayKey() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function announce(message) { $('#appStatus').textContent = message; window.setTimeout(() => { if ($('#appStatus').textContent === message) $('#appStatus').textContent = ''; }, 2400); }
function reportStorageError() { announce('Không thể lưu. Hãy kiểm tra dung lượng trên iPhone.'); }
function selectedBounds() { return periodBounds(state.selectedPeriodKey, state.cycleEndDay, state.anchor); }
function allSelectedPeriodExpenses() { return expensesForPeriod(state.expenses, selectedBounds()); }
function selectedExpenses() { return expensesForPeriod(state.expenses, selectedBounds(), state.selectedCategoryId); }
function effectiveTheme(choice) { return choice === 'system' ? (systemTheme.matches ? 'dark' : 'light') : choice; }
function applyTheme(choice) { const effective = effectiveTheme(choice); document.documentElement.dataset.theme = effective; $('#themeColor').content = effective === 'dark' ? '#09130F' : '#F4F7F5'; $('#themeButton').textContent = effective === 'dark' ? '☾' : '☼'; document.querySelectorAll('input[name="theme"]').forEach(radio => { radio.checked = radio.value === choice; }); }
function makeButton(label, className = '') { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; if (className) button.className = className; return button; }
function closeSwipe() { if (!swipeRow) return; swipeRow.classList.remove('is-open'); swipeRow = null; }
function updateKeyboardInset() { const viewport = window.visualViewport; const inset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0; document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`); }

function render() {
  const bounds = selectedBounds(); const income = state.periodIncomes[state.selectedPeriodKey] ?? null; const summary = calculatePeriodSummary(income, allSelectedPeriodExpenses());
  $('#periodRange').textContent = bounds.rangeLabel; $('#periodEndDay').textContent = `Kết thúc ngày ${state.cycleEndDay}`; $('#previousPeriod').disabled = state.anchor !== null && bounds.startDate === state.anchor; $('#remainingLabel').textContent = summary.status === 'exceeded' ? 'Vượt' : 'Còn lại'; $('#remainingAmount').textContent = summary.remaining === null ? '—' : formatVnd(Math.abs(summary.remaining)); $('#periodStatus').textContent = STATUS_COPY[summary.status]; $('#incomeButton').textContent = income === null ? 'Nhập thu nhập' : formatVnd(income); $('#spentAmount').textContent = formatVnd(summary.spent); $('.progress').setAttribute('aria-valuenow', String(Math.min(100, Math.round(summary.percentageUsed ?? 0)))); $('.progress').setAttribute('aria-valuetext', summary.percentageUsed === null ? 'Chưa có thu nhập' : `Đã dùng ${Math.round(summary.percentageUsed)} phần trăm`); $('#progressFill').style.width = `${Math.min(100, summary.percentageUsed ?? 0)}%`; $('#summary').dataset.status = summary.status; renderCategoryFilter(); renderCategoryGrid(); renderExpenseList();
}

function renderCategoryFilter() {
  const container = $('#categoryFilter'); container.replaceChildren();
  const all = makeButton('Tất cả', 'filter-chip'); all.setAttribute('aria-pressed', String(state.selectedCategoryId === 'all')); all.addEventListener('click', () => { state.selectedCategoryId = 'all'; render(); }); container.append(all);
  state.categories.forEach(category => { const button = makeButton(`${category.emoji} ${category.name}`, 'filter-chip'); button.setAttribute('aria-pressed', String(state.selectedCategoryId === category.id)); button.addEventListener('click', () => { state.selectedCategoryId = category.id; render(); }); container.append(button); });
}
function renderCategoryGrid(selected = $('#categoryGrid').dataset.selected || state.lastCategory) {
  const grid = $('#categoryGrid'); grid.replaceChildren(); grid.dataset.selected = selected;
  state.categories.forEach(category => { const button = makeButton(`${category.emoji} ${category.name}`, 'category-option'); button.setAttribute('aria-pressed', String(selected === category.id)); button.style.setProperty('--category-color', category.color); button.addEventListener('click', () => renderCategoryGrid(category.id)); grid.append(button); });
}
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

function updatePeriodPreview() {
  const day = Number($('#cycleEndDay').value);
  const anchor = $('#cycleAnchor').value || null;
  const preview = $('#periodPreview');
  if (!Number.isInteger(day) || day < 1 || day > 31) { preview.textContent = ''; return; }
  const current = periodBounds(state.selectedPeriodKey, day, anchor);
  const next = periodBounds(shiftPeriodKey(state.selectedPeriodKey, 1), day, anchor);
  preview.textContent = `Kỳ này: ${current.rangeLabel} · Kỳ sau: ${next.rangeLabel}`;
}
function openIncomeEditor() { const input = $('#incomeAmount'); input.value = formatMoneyInput(state.periodIncomes[state.selectedPeriodKey] ?? ''); $('#incomeAmountError').textContent = ''; $('#incomeSheet').showModal(); input.focus({ preventScroll: true }); }
function saveIncome(event) { event.preventDefault(); const amount = parsePositiveAmount($('#incomeAmount').value); if (amount === null) { $('#incomeAmountError').textContent = 'Thu nhập phải lớn hơn 0.'; $('#incomeAmount').focus(); return; } try { repository.savePeriodIncome(state.selectedPeriodKey, amount); state.periodIncomes = { ...state.periodIncomes, [state.selectedPeriodKey]: amount }; $('#incomeSheet').close(); announce('Đã lưu thu nhập'); render(); } catch { $('#incomeAmountError').textContent = 'Không thể lưu trên iPhone.'; } }
function openExpenseEditor(expenseId = null) { editingExpenseId = expenseId; const expense = state.expenses.find(item => item.id === expenseId); $('#expenseTitle').textContent = expense ? 'Sửa khoản chi' : 'Thêm khoản chi'; $('#expenseAmount').value = expense ? formatMoneyInput(expense.amount) : ''; $('#expenseTitleInput').value = expense?.title ?? ''; $('#expenseDate').value = expense?.date ?? todayKey(); $('#categoryGrid').dataset.selected = expense?.catId ?? state.lastCategory; ['expenseAmountError', 'expenseTitleError', 'expenseDateError'].forEach(id => { $(`#${id}`).textContent = ''; }); renderCategoryGrid($('#categoryGrid').dataset.selected); $('#expenseSheet').showModal(); $('#expenseAmount').focus({ preventScroll: true }); }
function saveExpense(event) { event.preventDefault(); const amount = parsePositiveAmount($('#expenseAmount').value); const title = $('#expenseTitleInput').value.trim(); const date = $('#expenseDate').value; const categoryId = $('#categoryGrid').dataset.selected || 'other'; let valid = true; if (amount === null) { $('#expenseAmountError').textContent = 'Số tiền phải lớn hơn 0.'; valid = false; } if (!title || title.length > 80) { $('#expenseTitleError').textContent = 'Tiêu đề từ 1 đến 80 ký tự.'; valid = false; } if (!isValidDateKey(date)) { $('#expenseDateError').textContent = 'Ngày không hợp lệ.'; valid = false; } if (!valid) return; const next = editingExpenseId ? state.expenses.map(item => item.id === editingExpenseId ? { ...item, title, amount, date, catId: categoryId } : item) : [...state.expenses, { id: crypto.randomUUID(), title, amount, date, catId: categoryId }]; try { repository.saveExpenses(next); repository.saveLastCategory(categoryId); state.expenses = next; state.lastCategory = categoryId; $('#expenseSheet').close(); announce(editingExpenseId ? 'Đã cập nhật khoản chi' : 'Đã lưu khoản chi'); render(); } catch { announce('Không thể lưu khoản chi.'); } }
async function deleteExpense(expenseId) { const expense = state.expenses.find(item => item.id === expenseId); if (!expense || !(await confirmAction(`Xóa khoản chi “${expense.title}”?`, 'Xóa'))) return; try { const next = state.expenses.filter(item => item.id !== expenseId); repository.saveExpenses(next); state.expenses = next; announce('Đã xóa khoản chi'); render(); } catch { reportStorageError(); } }
function confirmAction(message, label) { return new Promise(resolve => { $('#confirmMessage').textContent = message; $('#confirmAction').textContent = label; const dialog = $('#confirmDialog'); const form = dialog.querySelector('form'); const done = event => { event.preventDefault(); dialog.close(); resolve(event.submitter?.value === 'confirm'); form.removeEventListener('submit', done); }; form.addEventListener('submit', done); dialog.showModal(); }); }

function renderCategoryManager() { const list = $('#categoryManagerList'); list.replaceChildren(); state.categories.forEach((category, index) => { const row = document.createElement('li'); row.className = 'category-manager-row'; const name = document.createElement('span'); name.textContent = `${category.emoji} ${category.name}`; const actions = document.createElement('span'); actions.className = 'category-actions'; const edit = makeButton('Sửa'); edit.addEventListener('click', () => openCategoryEditor(category)); const up = makeButton('↑'); up.disabled = index === 0; up.addEventListener('click', () => reorderCategory(index, index - 1)); const down = makeButton('↓'); down.disabled = index === state.categories.length - 1; down.addEventListener('click', () => reorderCategory(index, index + 1)); actions.append(up, down, edit); if (category.id !== 'other') { const remove = makeButton('Xóa'); remove.addEventListener('click', () => removeCategory(category)); actions.append(remove); } row.append(name, actions); list.append(row); }); }
function openCategoryEditor(category = null) { $('#categoryId').value = category?.id ?? ''; $('#categoryName').value = category?.name ?? ''; $('#categoryEmoji').value = category?.emoji ?? '📌'; $('#categoryColor').value = category?.color ?? '#64748B'; $('#categoryNameError').textContent = ''; $('#categoryEditor').showModal(); requestAnimationFrame(() => $('#categoryName').focus({ preventScroll: true })); }
function saveCategory(event) { event.preventDefault(); const id = $('#categoryId').value || `custom-${crypto.randomUUID()}`; const name = $('#categoryName').value.trim(); const emoji = $('#categoryEmoji').value.trim() || '📌'; const color = $('#categoryColor').value; if (!name || name.length > 40) { $('#categoryNameError').textContent = 'Tên danh mục từ 1 đến 40 ký tự.'; return; } if (state.categories.some(category => category.name === name && category.id !== id)) { $('#categoryNameError').textContent = 'Tên danh mục đã tồn tại.'; return; } const next = state.categories.some(category => category.id === id) ? state.categories.map(category => category.id === id ? { id, name, emoji, color } : category) : [...state.categories, { id, name, emoji, color }]; try { repository.saveCategories(next); state.categories = next; $('#categoryEditor').close(); renderCategoryManager(); render(); announce('Đã lưu danh mục'); } catch { announce('Không thể lưu danh mục.'); } }
function reorderCategory(from, to) { const next = [...state.categories]; [next[from], next[to]] = [next[to], next[from]]; try { repository.saveCategories(next); state.categories = next; renderCategoryManager(); renderCategoryGrid(); renderCategoryFilter(); } catch { reportStorageError(); } }
async function removeCategory(category) { if (!(await confirmAction(`Xóa “${category.name}”? Khoản chi sẽ chuyển sang Khác.`, 'Xóa'))) return; try { const result = repository.deleteCategory(category.id); state.expenses = result.expenses; state.categories = result.categories; renderCategoryManager(); render(); announce('Đã xóa danh mục'); } catch { reportStorageError(); } }

function saveCycleSettings(event) {
  event.preventDefault(); const day = Number($('#cycleEndDay').value); const anchor = $('#cycleAnchor').value || null;
  if (!Number.isInteger(day) || day < 1 || day > 31) { $('#cycleEndDayError').textContent = 'Ngày kết thúc từ 1 đến 31.'; return; }
  if (anchor !== null && !isValidDateKey(anchor)) { $('#cycleAnchorError').textContent = 'Ngày bắt đầu không hợp lệ.'; return; }
  const finish = () => {
    try {
      repository.saveCycleEndDay(day); state.cycleEndDay = day;
      repository.saveAnchor(anchor); state.anchor = anchor;
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

if (!loaded.ok) { $('#storageError').hidden = false; $('#storageError').textContent = 'Silo không đọc được dữ liệu đang lưu và đã dừng ghi để tránh ghi đè.'; } else {
  const savedPeriod = sessionStorage.getItem('silo_selected_period');
  const selectedPeriodKey = isValidPeriodKey(savedPeriod) ? savedPeriod : (loaded.state.anchor !== null && todayKey() < loaded.state.anchor ? periodKeyForDate(loaded.state.anchor, loaded.state.cycleEndDay) : periodKeyForDate(todayKey(), loaded.state.cycleEndDay));
  if (savedPeriod) sessionStorage.removeItem('silo_selected_period');
  state = { ...loaded.state, selectedPeriodKey, selectedCategoryId: 'all' }; $('#app').inert = false; applyTheme(state.theme);
  $('#themeButton').addEventListener('click', () => $('#themeSheet').showModal()); $('#themeForm').addEventListener('change', event => { if (event.target.name !== 'theme') return; try { repository.saveTheme(event.target.value); state.theme = event.target.value; applyTheme(state.theme); $('#themeSheet').close(); } catch { reportStorageError(); } }); systemTheme.addEventListener('change', () => { if (state.theme === 'system') applyTheme('system'); });
  $('#previousPeriod').addEventListener('click', () => { state.selectedPeriodKey = shiftPeriodKey(state.selectedPeriodKey, -1); state.selectedCategoryId = 'all'; render(); }); $('#nextPeriod').addEventListener('click', () => { state.selectedPeriodKey = shiftPeriodKey(state.selectedPeriodKey, 1); state.selectedCategoryId = 'all'; render(); }); $('#periodPicker').addEventListener('click', () => { $('#cycleEndDay').value = state.cycleEndDay; $('#cycleAnchor').value = state.anchor ?? ''; $('#cycleEndDayError').textContent = ''; $('#cycleAnchorError').textContent = ''; updatePeriodPreview(); $('#periodSettingsSheet').showModal(); }); $('#incomeButton').addEventListener('click', openIncomeEditor); $('#incomeForm').addEventListener('submit', saveIncome); $('#addExpense').addEventListener('click', () => openExpenseEditor()); $('#expenseForm').addEventListener('submit', saveExpense); $('#manageCategories').addEventListener('click', () => { renderCategoryManager(); $('#categorySheet').showModal(); }); $('#addCategoryButton').addEventListener('click', () => openCategoryEditor()); $('#categoryForm').addEventListener('submit', saveCategory); $('#periodSettingsForm').addEventListener('submit', saveCycleSettings); $('#periodSettingsForm').addEventListener('input', updatePeriodPreview);
  window.visualViewport?.addEventListener('resize', updateKeyboardInset); window.visualViewport?.addEventListener('scroll', updateKeyboardInset);
  document.addEventListener('focusin', event => { if (!['expenseAmount', 'incomeAmount'].includes(event.target.id) || !navigator.maxTouchPoints) return; event.target.closest('dialog')?.querySelector('.money-accessory')?.removeAttribute('hidden'); updateKeyboardInset(); });
  document.addEventListener('focusout', event => { if (!['expenseAmount', 'incomeAmount'].includes(event.target.id)) return; const dialog = event.target.closest('dialog'); window.setTimeout(() => { const active = document.activeElement; if (!dialog?.contains(active) || (!['expenseAmount', 'incomeAmount'].includes(active.id) && !active.closest('.money-accessory'))) dialog?.querySelector('.money-accessory')?.setAttribute('hidden', ''); updateKeyboardInset(); }, 150); });
  document.addEventListener('click', event => { const button = event.target.closest('[data-triple-zero]'); if (!button) return; const input = document.getElementById(button.dataset.tripleZero); const digits = appendTripleZero(input.value); if (digits) { input.value = formatMoneyInput(digits); input.dispatchEvent(new Event('input', { bubbles: true })); input.focus({ preventScroll: true }); } });
  document.addEventListener('input', event => { if (!['expenseAmount', 'incomeAmount'].includes(event.target.id)) return; const value = formatMoneyInput(event.target.value); event.target.value = value; event.target.setSelectionRange(value.length, value.length); dirtyDialogId = event.target.closest('dialog')?.id ?? dirtyDialogId; }); document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => { const dialog = document.getElementById(button.dataset.close); if (dirtyDialogId === dialog.id && !confirm('Bỏ các thay đổi chưa lưu?')) return; dialog.close(); })); document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => { dirtyDialogId = null; dialog.querySelector('.money-accessory')?.setAttribute('hidden', ''); }));
  let swipeEndedAt = 0;
  const endSwipe = () => {
    const gesture = swipeGesture; swipeGesture = null;
    if (!gesture?.dragging) return;
    swipeEndedAt = performance.now(); // the click some browsers fire after a drag must not close the row it just opened
    gesture.track.classList.remove('is-dragging');
    void gesture.track.offsetWidth; // let the resting transition resume from where the finger left off
    gesture.track.style.transform = '';
    const open = swipeTarget(gesture.offset, gesture.velocity) === 'open';
    gesture.row.classList.toggle('is-open', open);
    swipeRow = open ? gesture.row : null;
  };
  $('#expenseList').addEventListener('pointerdown', event => {
    if (event.button) return;
    const track = event.target.closest('.expense-track');
    if (!track) return;
    swipeGesture = { track, row: track.closest('.expense-row'), limit: 0, base: 0, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastTime: event.timeStamp, offset: 0, velocity: 0, dragging: false };
  });
  $('#expenseList').addEventListener('pointermove', event => {
    const gesture = swipeGesture;
    if (!gesture) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.dragging) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      if (Math.abs(deltaY) >= Math.abs(deltaX)) { swipeGesture = null; return; }
      gesture.limit = gesture.row.querySelector('.expense-actions').offsetWidth;
      gesture.base = gesture.row.classList.contains('is-open') ? -gesture.limit : 0;
      closeSwipe();
      gesture.track.setPointerCapture(event.pointerId);
      gesture.dragging = true;
      gesture.track.classList.add('is-dragging');
    }
    const elapsed = event.timeStamp - gesture.lastTime;
    if (elapsed > 0) { gesture.velocity = (event.clientX - gesture.lastX) / elapsed; gesture.lastX = event.clientX; gesture.lastTime = event.timeStamp; }
    const scale = window.devicePixelRatio || 1;
    const offset = Math.max(-gesture.limit, Math.min(0, gesture.base + deltaX));
    gesture.offset = Math.max(-gesture.limit, Math.min(0, Math.round(offset * scale) / scale));
    gesture.track.style.transform = `translateX(${gesture.offset}px)`;
  });
  $('#expenseList').addEventListener('pointerup', endSwipe);
  $('#expenseList').addEventListener('pointercancel', endSwipe);
  $('#expenseList').addEventListener('click', event => {
    if (performance.now() - swipeEndedAt < 350) return;
    if (!event.target.closest('.expense-actions')) closeSwipe();
  });
  window.addEventListener('scroll', closeSwipe, { passive: true });
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => false);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then(registration => { const showUpdate = () => { $('#updateBanner').hidden = false; $('#updateBanner').onclick = () => { if (dirtyDialogId) { announce('Hãy lưu hoặc đóng biểu mẫu trước khi cập nhật.'); return; } registration.waiting?.postMessage({ type: 'SKIP_WAITING' }); }; }; if (registration.waiting) showUpdate(); registration.addEventListener('updatefound', () => { const worker = registration.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(); }); }); }).catch(() => false);
  let reloading = false; navigator.serviceWorker?.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; sessionStorage.setItem('silo_selected_period', state.selectedPeriodKey); location.reload(); });
  render(); // deliberately last: a render-time error must not leave every listener unattached, which hides even the update banner
}
