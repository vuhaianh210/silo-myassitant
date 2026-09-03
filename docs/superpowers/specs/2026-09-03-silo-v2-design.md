# Silo 2.0 — Product and UX Design Specification

**Status:** Ready for user review

**Date:** 2026-09-03

**Target:** Existing `vuhaianh210/silo-myassitant` GitHub Pages PWA

**Primary device:** iPhone, installed to the Home Screen

**Language and currency:** Vietnamese and VND

## 1. Purpose

Silo 2.0 is a small, local-first personal spending tool for one owner. The owner chooses a recurring start day, manually enters income for each resulting spending period, and manually records expenses. Silo immediately shows how much income is available, how much has been used, and how much remains in the current period.

The product must remain usable as an installable PWA hosted by GitHub Pages. GitHub serves only the application code. Financial data stays in browser storage on the owner's iPhone.

## 2. Goals

1. Make the remaining money in the selected spending period the clearest information on the screen.
2. Let the owner record an expense in a few one-handed actions.
3. Support fast VND entry using the iPhone numeric keyboard and a visible `000` shortcut.
4. Make categories easy to recognize through a stable combination of icon, name, and color.
5. Follow the iPhone system appearance by default while allowing explicit light or dark overrides.
6. Let the owner choose the recurring day on which a spending period begins.
7. Preserve all existing expenses and custom categories during the upgrade.
8. Continue working offline without a server, account, bank integration, or build system.

## 3. Non-goals

- Bank, wallet, card, or financial-account integrations.
- Automatic transaction import or automatic income calculation.
- Income transactions. Income is a separate manually entered period value, not a transaction type.
- Carrying unused money into the following spending period.
- Multiple wallets, shared household accounts, login, cloud sync, or a server database.
- Export, backup, restore, or cross-device migration.
- Recurring expenses, savings goals, subscriptions, or investment-performance tracking.
- App Store distribution.
- Framework migration to React, Vue, Svelte, or another application framework.

## 4. Existing baseline

The current product is a static PWA with:

- `index.html` containing markup, styling, and application logic.
- `manifest.json` for standalone Home Screen installation.
- `sw.js` for offline caching.
- Local expense and category storage using `localStorage`.
- Expense creation, editing, deletion, month navigation, category filtering, and category management.

The upgrade must preserve these working behaviors unless this specification explicitly replaces them.

## 5. Information architecture

Silo remains a single-screen product with bottom sheets for focused tasks.

### 5.1 Main screen hierarchy

1. Compact header with the Silo name and appearance control.
2. Spending-period selector with previous and next controls.
3. Period position, led by the amount remaining.
4. Income, amount used, percentage used, and progress indicator.
5. Category filter.
6. Transactions grouped by date.
7. Persistent add-expense action within one-handed reach.

### 5.2 Bottom sheets

- Set or edit period income.
- Set the recurring period-start day.
- Add or edit an expense.
- Manage categories.
- Choose appearance: System, Light, or Dark.
- Confirm destructive actions.

Sheets must respect iPhone safe-area insets and remain usable while the software keyboard is visible.

## 6. Income and spending-period model

### 6.1 Behavior

- The owner chooses one recurring period-start day from 1 through 31. Default is 1.
- A period starts on that effective day and ends one day before the next period starts.
- For a month that lacks the chosen day, the effective start is the last calendar day of that month.
- Periods are contiguous and non-overlapping. For example, a chosen day of 31 yields `31/01–27/02`, followed by `28/02–30/03` in a non-leap year.
- A period is identified internally by the calendar month containing its start, using key `YYYY-MM`.
- The owner manually enters independent income for each period.
- Unused money never rolls into the next period.
- A new period starts with no income until the owner enters it.
- Expenses may be recorded before income is entered.
- Period income may be edited at any time.
- Income lower than expenses already recorded is valid and produces an exceeded state.
- Changing the recurring start day immediately recalculates period boundaries and transaction membership without changing or deleting transactions.
- Existing period-income values remain keyed to their start calendar month when the start day changes.
- Changing the start day requires confirmation explaining that historical transactions will be regrouped, then selects the period containing today's date.

### 6.2 Period naming

- A period contained within one calendar month is labeled `Kỳ tháng 9`.
- A period crossing adjacent months in the same year is labeled `Kỳ tháng 9–10`.
- A period crossing a year boundary is labeled with both years, for example `Kỳ tháng 12/2026–1/2027`.
- The exact date range appears as supporting text, for example `25/09–24/10`.

### 6.3 Calculations

For the selected period:

- Resolve the period's exact local start and exclusive end date from the configured start day and period key.
- `spent = sum(expense.amount)` for expenses with `startDate <= expense.date < nextStartDate`.
- When income exists, `remaining = income - spent`.
- When income is greater than zero, `percentageUsed = spent / income * 100`.
- Display percentage may exceed 100%; the visual progress track caps its filled width at 100%.
- When no income exists, remaining amount and percentage are shown as unavailable rather than as zero.

### 6.4 Status language

- Below 80%: **Còn trong kế hoạch**.
- From 80% to below 100%: **Sắp dùng hết thu nhập kỳ này**.
- At or above 100%: **Đã chi vượt thu nhập kỳ này**.
- No income: **Chưa nhập thu nhập kỳ này**.

Status must always use text as well as color.

## 7. Main-screen design

### 7.1 Period position

- The largest value in the first viewport is the remaining amount.
- When income is exceeded, the label changes from `Còn lại` to `Vượt` and the absolute exceeded amount is displayed.
- Income and amount used appear as supporting values below the lead number.
- The income value is interactive and opens the income editor.
- The progress indicator includes an accessible text equivalent.

### 7.2 Period navigation

- Previous and next controls remain available on both sides of a centered period label.
- Controls have accessible names `Kỳ trước` and `Kỳ sau`.
- The period label follows section 6.2 and displays the exact range below it.
- Changing period updates income, totals, status, category filters, and transactions as one state change.

### 7.3 Transaction list

- Transactions are grouped under local date headings.
- Each row shows category icon, title, category name, amount, and date context.
- Amounts are right-aligned and use tabular numerals.
- Tapping a row opens edit mode.
- Swiping left reveals Delete; Delete is also available through an accessible row action.
- Deleting requires confirmation that includes the transaction title and formatted amount.
- Empty periods show a concise empty state and keep the add action prominent.

### 7.4 Feedback

- Saving income or an expense updates the main screen immediately.
- A short non-blocking status message confirms `Đã lưu`.
- Feedback must be exposed through an ARIA live region.
- Motion is brief, functional, and disabled or reduced when `prefers-reduced-motion` requests it.

## 8. Amount-entry design

### 8.1 Input behavior

- Amount is the first field in both income and expense sheets.
- The amount control receives focus when a sheet opens, unless automatic focus would create a disruptive viewport jump.
- Use a text-compatible input with `inputmode="numeric"` so the iPhone presents its numeric keyboard while the app remains able to format the visible value.
- Accept digits only. Spaces, grouping separators, pasted currency symbols, decimal separators, signs, and other characters are removed before validation.
- Format valid digits as Vietnamese VND grouping while typing, for example `5000000` becomes `5.000.000`.
- Store the underlying amount as a positive integer, never as the formatted string.
- Place the currency label `₫` next to the field without making it part of the editable value.

### 8.2 `000` shortcut

- A visible `000` control sits next to or directly below the amount field.
- It has a minimum 44 by 44 CSS-pixel hit area and accessible name `Thêm ba số không`.
- If the current normalized value contains at least one non-zero digit, append exactly three zeros.
- Examples: `5 → 5.000`, `50 → 50.000`, `125 → 125.000`.
- If the field is empty or normalizes to zero, the shortcut makes no change.
- Applying the shortcut must trigger normal formatting and validation.

### 8.3 Validation

- Amount must be a safe positive integer.
- Title is required for an expense and limited to 80 Unicode characters.
- Date must be a valid local `YYYY-MM-DD` value.
- Category must resolve to an existing category; otherwise use `other`.
- Errors appear beside the relevant field, remain visible until corrected, and receive focus or announcement on submit.
- A failed storage write keeps the sheet open and preserves all entered values.

## 9. Appearance system

### 9.1 Modes

- `system` is the default.
- `light` forces the light palette.
- `dark` forces the dark palette.

The selected mode is stored locally and restored before the first painted frame where practical to avoid a theme flash.

### 9.2 Control

- A sun/moon appearance button appears in the header.
- Activating it opens a compact menu or sheet with `Theo hệ thống`, `Sáng`, and `Tối`.
- The current selection is clearly checked.
- The control has a text-equivalent accessible name.

### 9.3 System behavior

- In `system`, use `prefers-color-scheme` and respond to changes while the app is open.
- In an explicit mode, later system changes do not override the owner’s selection.
- The browser and Home Screen status-bar/theme color must follow the effective appearance.

### 9.4 Visual direction

Silo is an operating interface, so scanability outranks decoration.

- Light mode is the base palette: soft near-white ground, dark blue-black text, quiet surfaces, and strong focus treatment.
- Dark mode uses a deep blue-black ground, light text, and clearly separated surfaces.
- Use one primary accent; reserve strong red for destructive actions and income-exceeded states.
- Avoid decorative gradients, glass effects, excessive shadows, and nested cards.
- Use the native Apple system font stack and tabular numerals for money.
- Maintain readable contrast in both modes and test category colors on both palettes.

## 10. Categories

### 10.1 Default list and stable identifiers

| Order | ID | Label | Icon | Color role |
|---:|---|---|---|---|
| 1 | `food` | Ăn uống | 🍜 | Orange |
| 2 | `transport` | Đi lại | 🛵 | Blue |
| 3 | `housing` | Nhà ở | 🏠 | Teal |
| 4 | `bill` | Hóa đơn & dịch vụ | 🧾 | Amber |
| 5 | `shopping` | Mua sắm | 🛍️ | Pink |
| 6 | `health` | Sức khỏe | 💊 | Green |
| 7 | `investment` | Đầu tư | 📈 | Indigo |
| 8 | `saving` | Tiết kiệm | 🐷 | Cyan |
| 9 | `growth` | Phát triển bản thân | 🌱 | Olive |
| 10 | `fun` | Giải trí | 🎮 | Purple |
| 11 | `family` | Gia đình & quà tặng | 🎁 | Brown-orange |
| 12 | `other` | Khác | 📌 | Gray |

`Phát triển bản thân` includes books, courses, tuition, workshops, coaching, and skill-building tools. There is no separate `Học tập` default category.

`Tiết kiệm` and `Đầu tư` are expense categories in Silo's calculation model. Amounts entered under them count as money used in the current period and reduce the remaining amount.

### 10.2 Expense-sheet selector

- Display categories in a two-column touch grid.
- Every option shows icon, full name, and a tinted color surface.
- Selected state adds a clear border and checkmark.
- Never rely only on emoji or color.
- Preselect the most recently used valid category for a new expense.
- Editing an expense selects its saved category.

### 10.3 Main-screen filter

- `Tất cả` is always first.
- Show only categories represented in the selected period's transactions.
- Preserve the configured category order.
- The filter may scroll horizontally but must expose a visible selected state and readable label.

### 10.4 Category management

- The owner may add, rename, recolor, re-icon, reorder, and delete categories.
- Names are trimmed, required, and compared case-insensitively for duplicates.
- Reordering uses a touch-friendly drag handle and has an accessible non-drag alternative.
- `other` may be renamed, re-iconed, or recolored but not deleted.
- Deleting an in-use category requires confirmation and reassigns all affected expenses to `other` in the same successful storage operation.

### 10.5 Upgrade behavior

- Preserve all custom categories and their identifiers.
- Rename existing default `bill` from `Hóa đơn` to `Hóa đơn & dịch vụ` only when its current name still matches the old default; do not overwrite an owner-customized name.
- Add `housing`, `investment`, `saving`, `growth`, and `family` when those default identifiers are absent.
- Remove no existing category automatically.
- Preserve the old `edu` category if it exists because historical expenses may reference it. Do not show `edu` as a new-install default. The owner may later merge or delete it through category management.
- Color is supplemental. Category name and icon remain present in all important contexts.

## 11. Local data model

Keep the current storage keys to minimize migration risk and add narrowly scoped keys.

### 11.1 Existing keys

- `silo_expenses`: JSON array of expense records.
- `silo_categories`: JSON array of category records.

### 11.2 New keys

- `silo_period_incomes`: JSON object mapping a period start-month key `YYYY-MM` to positive integer VND income.
- `silo_cycle_start_day`: integer from 1 through 31; default 1.
- `silo_theme`: string enum `system`, `light`, or `dark`.
- `silo_last_category`: last successfully used category ID.
- `silo_schema_version`: integer schema marker for idempotent migrations.

### 11.3 Expense record

```json
{
  "id": "stable-unique-string",
  "title": "Ăn sáng",
  "amount": 35000,
  "date": "2026-09-03",
  "catId": "food"
}
```

### 11.4 Category record

```json
{
  "id": "food",
  "name": "Ăn uống",
  "emoji": "🍜",
  "color": "#F97316"
}
```

### 11.5 Storage rules

- Parse every key through one guarded storage layer.
- Validate loaded shapes before rendering or calculating.
- Never overwrite a malformed source key automatically.
- If required financial data cannot be parsed, enter a read-only error state with a clear message instead of silently resetting.
- Catch quota and security errors on every write.
- Request persistent storage through `navigator.storage.persist()` when supported. Denial is non-fatal.
- No financial values are written to logs, URLs, analytics, GitHub, or the service-worker cache.

## 12. Migration

Migration must be idempotent and run before normal rendering.

1. Read and validate existing expenses and categories.
2. If either required source is malformed, stop migration and show the read-only data error state.
3. Preserve every valid expense without changing its ID, amount, title, date, or category reference.
4. Preserve custom categories.
5. Apply only the category additions and conditional rename described in section 10.5.
6. Initialize missing new keys with empty period incomes, cycle start day 1, `system` theme, and no last category.
7. Write the new schema version only after every migration write succeeds.
8. Running the migration again produces no duplicate categories or altered expenses.

## 13. Offline and update behavior

- Increment the service-worker cache version for Silo 2.0.
- Precache only application-shell assets owned by Silo.
- Delete obsolete Silo caches during activation.
- Use an update strategy that does not trap users indefinitely on stale `index.html`.
- Do not force a reload while a form contains unsaved input.
- When a waiting service worker is ready, show `Có bản cập nhật — Tải lại`.
- Activating the user-requested update reloads once and returns to the selected period.
- A first successful online load must be followed by a verified offline launch.

## 14. Accessibility and responsive behavior

- Support viewport widths from 320 CSS pixels upward, with explicit acceptance checks at 375, 390, and 430 pixels.
- Respect top and bottom safe-area insets in standalone mode.
- Minimum interactive target is 44 by 44 CSS pixels.
- Do not disable user zoom.
- Keep focus visible in both themes.
- Sheets trap focus while open, close with Escape on hardware keyboards, and return focus to their trigger.
- Icon-only controls have accessible names.
- Validation and save status use live announcements.
- Support larger iPhone text settings without clipping amounts, controls, or labels.
- Respect `prefers-reduced-motion`.
- Ensure the fixed save action remains visible above the software keyboard or is reachable without obscuring required fields.

## 15. Security and integrity

- Render owner-entered titles and category names with `textContent` or equivalent safe DOM APIs, never by interpolating them into `innerHTML`.
- Treat imported browser storage as untrusted input even though it is local.
- Generate IDs without using owner-entered text.
- Confirm destructive actions with specific item context.
- Category deletion and expense reassignment must either both persist or neither change the in-memory UI state.
- Application code must not introduce external analytics, fonts, scripts, or network APIs.

## 16. Proposed source organization

Use static browser-native modules with no bundler:

```text
index.html          Semantic app shell and dialogs/sheets
styles.css          Tokens, themes, layout, components, responsive rules
app.js              App state, event wiring, rendering, sheet coordination
logic.js            Pure money, period, filtering, status, and formatting logic
storage.js          Guarded localStorage, validation, and migration
sw.js               Offline shell and controlled updates
manifest.json       PWA metadata
icons/              Existing app icons, updated only if required
tests/              Browser-independent tests for pure logic and migration
PRODUCT.md          Durable product context
docs/               Product design and implementation plans
```

This separation is intentionally small. Do not add a framework, state library, CSS framework, database wrapper, or build pipeline.

## 17. Error and empty states

### No income

- Show `Chưa nhập thu nhập kỳ này` and primary action `Nhập thu nhập`.
- Continue showing any expenses already recorded.

### No transactions

- Show `Chưa có khoản chi trong tháng này` and retain the add action.

### Storage write failure

- Preserve form values.
- Show `Không thể lưu trên iPhone. Hãy kiểm tra dung lượng và thử lại.`
- Do not update totals optimistically.

### Malformed stored financial data

- Enter read-only mode.
- Show `Silo không đọc được dữ liệu đang lưu và đã dừng ghi để tránh ghi đè.`
- Do not reset, migrate, or overwrite malformed keys.

### Offline first visit

- If the application shell has never been cached, show the browser's normal unavailable state; Silo cannot promise offline availability before one successful online load.

## 18. Verification strategy

### 18.1 Automated logic checks

- Sum only selected-period expenses.
- Calculate remaining and percentages, including zero-spend and exceeded cases.
- Treat no income differently from a zero numeric value.
- Resolve period boundaries for start days 1, 25, 28, 29, 30, and 31 in leap and non-leap years.
- Label same-month, cross-month, and cross-year periods correctly.
- Reassign expenses to the correct periods after changing the start day without changing the expense records.
- Format VND and normalize pasted input.
- Verify `000` behavior for empty, zero, one-digit, two-digit, and existing grouped input.
- Derive period keys without UTC date conversion.
- Validate expenses, categories, period incomes, cycle start day, and themes.
- Run migration twice and prove that it is idempotent.
- Preserve custom categories and legacy `edu` references.
- Reassign transactions atomically when an in-use category is deleted.

Use a small browser-independent test suite and the platform's standard capabilities; do not add a test framework solely for this project.

### 18.2 Manual functional checks

- Create, edit, and delete an expense.
- Set and edit income before and after expenses exist.
- Change the start day and verify period ranges and regrouped expenses.
- Navigate across periods with different income states.
- Cross 80% and 100% thresholds.
- Create, edit, reorder, and delete a category.
- Verify last-used category selection.
- Switch System, Light, and Dark; reload; change system appearance while the app is open.
- Verify update notification does not discard an open form.
- Launch and use the installed PWA offline.

### 18.3 Visual checks

- Inspect 375, 390, and 430 pixel widths in light and dark modes.
- Inspect large text, long transaction titles, long category names, large VND values, empty states, near-limit state, and exceeded state.
- Confirm safe-area spacing in Safari and standalone Home Screen mode.
- Confirm the keyboard does not hide the amount shortcut, validation, or save action.
- Run the Impeccable mechanical detector once after the final UI changes, fix mechanical findings, and perform one bounded visual review plus one confirmation pass.

## 19. Acceptance criteria

Silo 2.0 is ready when all statements below are true:

1. Existing valid expenses remain visible and unchanged after upgrade.
2. The owner can set separate income for any spending period.
3. The owner can choose a recurring start day from 1 through 31, including valid last-day handling.
4. A new period has no income and receives no carry-over.
5. The main screen accurately displays income, spent, remaining or exceeded amount, percentage, status, period name, and date range.
6. An expense can be entered with the iPhone numeric keyboard and `000` shortcut.
7. System, Light, and Dark appearance modes work and persist as specified.
8. The finalized default categories appear for a fresh install, and upgrades preserve custom and legacy categories.
9. Savings and investment entries reduce the selected period's remaining amount.
10. Expense and category CRUD remain functional with confirmation on destructive actions.
11. The app launches and remains usable offline after one successful online load.
12. No financial data is sent to GitHub or another remote service.
13. The interface passes the specified responsive, theme, keyboard, accessibility, and error-state checks.
14. The service-worker update flow never discards unsaved form input.

## 20. Implementation boundaries for the next plan

The implementation plan must:

- Work incrementally from the current repository rather than rewrite the product in a framework.
- Establish pure calculation and guarded storage boundaries before rebuilding the visual layer.
- Preserve the deployed GitHub Pages URL and relative asset paths.
- Include small verification checkpoints after data, UI, PWA, and deployment work.
- Treat migration, financial calculations, local write failures, accessible interaction, and offline updates as release-blocking behavior.
- Exclude every non-goal in section 3 unless the owner explicitly changes this specification.
