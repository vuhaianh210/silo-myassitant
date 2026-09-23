# Income Management Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a management sheet for the selected period's income and saved income history.

**Architecture:** Add a `Quản lý thu nhập` sheet that reads the existing `state.periodIncomes` map. Reuse the current amount editor, passing an explicit period key so editing history never changes the dashboard's selected period. Keep the existing local storage schema.

**Tech Stack:** Static HTML, CSS, and JavaScript ES modules; browser `dialog`; localStorage.

## Global Constraints

- Keep one positive safe-integer VND total per `YYYY-MM` period in `silo_period_incomes`.
- Do not add a storage migration, dependency, or multiple income sources.
- Keep all data local and all interface copy in Vietnamese.
- Preserve the 44px touch-target minimum, safe-area spacing, and light/dark themes.
- Bump `sw.js` cache generation when changing shipped app files.

---

### Task 1: Add the income manager sheet

**Files:**
- Modify: `index.html`
- Modify: `styles.css`

**Interfaces:**
- Produces: `#incomeManagerSheet`, `#incomeCurrent`, `#incomeHistory`, and `#incomeHistoryEmpty` for `app.js`.

- [ ] **Step 1: Add the manager sheet after `#incomeSheet` in `index.html`**

```html
<dialog id="incomeManagerSheet" class="sheet" aria-labelledby="incomeManagerTitle"><section><header><h2 id="incomeManagerTitle">Quản lý thu nhập</h2><button type="button" data-close="incomeManagerSheet" aria-label="Đóng">×</button></header><div id="incomeCurrent" class="income-current"></div><section aria-labelledby="incomeHistoryTitle"><h3 id="incomeHistoryTitle">Lịch sử thu nhập</h3><div id="incomeHistory" class="income-history"></div><p id="incomeHistoryEmpty" class="empty-state" hidden>Chưa có lịch sử thu nhập.</p></section></section></dialog>
```

- [ ] **Step 2: Style current income and history rows in `styles.css`**

```css
.income-current{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--surface-muted)}
.income-current p{margin:0;color:var(--muted);font-size:.85rem}
.income-current strong{display:block;margin-top:4px;color:var(--text);font-size:1rem;font-variant-numeric:tabular-nums}
.income-current button,.income-history-row{min-height:44px;padding:0 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--primary);font-size:.875rem;font-weight:700}
.income-history{display:grid;gap:8px;margin-top:10px}
.income-history-row{display:flex;width:100%;align-items:center;justify-content:space-between;gap:12px;text-align:left}
.income-history-row strong{color:var(--text);font-variant-numeric:tabular-nums}
#incomeHistoryTitle{margin:20px 0 0;font-size:1rem}
```

**Result:** The manager has named current and history regions, a useful empty state, and touch-size controls in both themes.

### Task 2: Render history and edit the chosen period

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `state.periodIncomes`, `periodBounds(periodKey, state.cycleEndDay, state.anchor)`, `formatVnd(amount)`, and `repository.savePeriodIncome(periodKey, amount)`.
- Produces: `renderIncomeManager()`, `openIncomeManager()`, and `openIncomeEditor(periodKey)`.

- [ ] **Step 1: Track the amount editor's target period**

Add beside the other top-level state variables:

```javascript
let editingIncomePeriodKey = null;
```

- [ ] **Step 2: Add the manager renderer and opener before `openIncomeEditor`**

```javascript
function renderIncomeManager() {
  const key = state.selectedPeriodKey;
  const current = state.periodIncomes[key] ?? null;
  const range = periodBounds(key, state.cycleEndDay, state.anchor).rangeLabel;
  const currentRegion = $('#incomeCurrent');
  currentRegion.replaceChildren();
  const copy = document.createElement('div');
  const label = document.createElement('p'); label.textContent = `Thu nhập kỳ đang xem · ${range}`;
  const amount = document.createElement('strong'); amount.textContent = current === null ? 'Chưa nhập thu nhập' : formatVnd(current);
  copy.append(label, amount);
  const edit = makeButton(current === null ? 'Nhập thu nhập' : 'Sửa thu nhập');
  edit.addEventListener('click', () => openIncomeEditor(key));
  currentRegion.append(copy, edit);

  const history = $('#incomeHistory'); history.replaceChildren();
  const entries = Object.entries(state.periodIncomes).filter(([periodKey]) => periodKey !== key).sort(([left], [right]) => right.localeCompare(left));
  $('#incomeHistoryEmpty').hidden = entries.length > 0;
  entries.forEach(([periodKey, value]) => {
    const periodRange = periodBounds(periodKey, state.cycleEndDay, state.anchor).rangeLabel;
    const row = makeButton('', 'income-history-row');
    const period = document.createElement('span'); period.textContent = periodRange;
    const income = document.createElement('strong'); income.textContent = formatVnd(value);
    row.setAttribute('aria-label', `Sửa thu nhập ${periodRange}, ${formatVnd(value)}`);
    row.append(period, income);
    row.addEventListener('click', () => openIncomeEditor(periodKey));
    history.append(row);
  });
}
function openIncomeManager() {
  renderIncomeManager();
  $('#incomeManagerSheet').showModal();
}
```

- [ ] **Step 3: Pass the selected period key through the existing amount editor and save handler**

Replace the existing income functions with:

```javascript
function openIncomeEditor(periodKey = state.selectedPeriodKey) {
  editingIncomePeriodKey = periodKey;
  const input = $('#incomeAmount');
  $('#incomeTitle').textContent = `Thu nhập kỳ ${periodBounds(periodKey, state.cycleEndDay, state.anchor).rangeLabel}`;
  input.value = formatMoneyInput(state.periodIncomes[periodKey] ?? '');
  $('#incomeAmountError').textContent = '';
  $('#incomeSheet').showModal();
  input.focus({ preventScroll: true });
}
function saveIncome(event) {
  event.preventDefault();
  const amount = parsePositiveAmount($('#incomeAmount').value);
  if (amount === null) { $('#incomeAmountError').textContent = 'Thu nhập phải lớn hơn 0.'; $('#incomeAmount').focus(); return; }
  const periodKey = editingIncomePeriodKey ?? state.selectedPeriodKey;
  try {
    repository.savePeriodIncome(periodKey, amount);
    state.periodIncomes = { ...state.periodIncomes, [periodKey]: amount };
    $('#incomeSheet').close();
    editingIncomePeriodKey = null;
    if ($('#incomeManagerSheet').open) renderIncomeManager();
    announce('Đã lưu thu nhập');
    render();
  } catch { $('#incomeAmountError').textContent = 'Không thể lưu trên iPhone.'; }
}
```

- [ ] **Step 4: Wire the summary button to the manager**

Change the startup listener from:

```javascript
$('#incomeButton').addEventListener('click', openIncomeEditor);
```

to:

```javascript
$('#incomeButton').addEventListener('click', openIncomeManager);
```

**Result:** Current and historical totals open the same validated editor, and each save targets only its own period key.

### Task 3: Release and verify the UI

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Bump `CACHE_NAME` from `silo-v13-atomic-shell` to `silo-v14-atomic-shell`**

- [ ] **Step 2: Run syntax and whitespace checks**

Run:

```bash
node --check app.js
node --check sw.js
git diff --check
```

Expected: each command exits with status 0.

- [ ] **Step 3: Manually verify on iPhone**

1. Tap `Thu nhập`; confirm the selected period and history appear.
2. Edit the selected period; confirm the dashboard summary updates after save.
3. Edit a historical row; confirm its amount changes and the dashboard's selected period stays the same.
4. Confirm empty history copy and light/dark styling.

## Plan self-review

- The approved current-period editor, descending history, historical editing, and unchanged selected period are covered in Tasks 1–2.
- Storage remains one positive amount per period; no migration or multiple-source work is planned.
- Cache delivery, syntax checks, and the approved iPhone validation are covered in Task 3.
