# Income entries per period — design

Status: **approved direction**, 2026-09-23.

## Problem

The income manager currently stores one total per period. The owner wants to record several
income items in a period, such as salary, bonus, and side income, and have Silo calculate their
total automatically.

## Approved interface

Tapping `Thu nhập` opens the `Quản lý thu nhập` sheet.

* The selected dashboard period opens first, showing its calculated total and named income items.
  The user can add, edit, or delete an item. Deletion asks for confirmation.
* Each item has a Vietnamese name and a positive VND amount. Names are required and limited to
  80 characters. The amount editor keeps its existing numeric formatting and validation.
* `Lịch sử thu nhập` lists the totals for other periods, newest first. Tapping one opens that
  period's items inside the same sheet. A back action returns to the dashboard-selected period.
* Editing or adding an item in a historical period only changes that period. It never changes the
  dashboard's selected period. The dashboard total and remaining amount refresh after saving.
* A period with no items has no total and keeps the existing missing-income summary state.

## Data and migration

`silo_period_incomes` remains the local storage key. Its old shape is a map from `YYYY-MM` to one
positive integer. The new shape maps each period to an array of `{ id, title, amount }` entries.
On load, each old amount becomes one entry titled `Thu nhập`; a successful single-key write
persists the migration. If that write fails, the original value remains intact and the app reports
the storage error. Totals are derived from entry amounts and must remain positive safe integers.

The existing cycle-setting migration still shifts period keys before normalizing old totals, so
legacy values move to the correct periods. No new storage key or dependency is introduced.

## Out of scope

Income dates inside a period, recurring income, income categories, exports, and changes to expense
data are excluded.

## Validation

Check that old totals become one `Thu nhập` item and preserve their total; adding, editing, and
deleting items updates the period total; history opens the chosen period without changing the
dashboard selection; empty periods retain the missing-income state; and light/dark sheets retain
44px touch targets and safe-area spacing.
