# Income management menu — design

Status: **approved direction**, 2026-09-23.

## Problem

The `Thu nhập` button currently opens an amount form directly. The owner wants a management menu
with the current period's total and income history.

## Existing behavior and data

`storage.js` stores one positive VND total per period in `silo_period_incomes`, keyed by `YYYY-MM`.
`savePeriodIncome(periodKey, amount)` already supports saving an amount for any period. The app has
no separate income-source records.

## Approved interface

Tapping `Thu nhập` opens a `Quản lý thu nhập` bottom sheet:

* The first section shows the income for the period currently selected on the dashboard. It has an
  `Sửa thu nhập` action, or `Nhập thu nhập` if the period has no saved total. This opens the existing
  amount editor prefilled with that period's value.
* `Lịch sử thu nhập` lists every other period with a saved amount, newest period first. Each row
  shows its period range and total. Tapping a row opens the same amount editor for that period.
* Saving a historical amount updates only that period's `YYYY-MM` entry. It does not change the
  period selected on the dashboard. Saving the selected period refreshes the summary immediately.
* If there are no other saved periods, show `Chưa có lịch sử thu nhập.`.

The sheet uses Silo's existing sheet style, Vietnamese copy, safe-area spacing, and 44px minimum
touch targets. The amount editor retains its validation and unsaved-change handling.

## Data flow and constraints

The manager reads `state.periodIncomes` and sorts its keys descending. It derives labels with the
existing period-boundary logic and current cycle settings. The editor receives an explicit target
period key rather than assuming `state.selectedPeriodKey`; saving calls the existing
`savePeriodIncome` path. The storage schema stays unchanged, so existing local income data requires
no migration.

## Out of scope

* Multiple income sources within one period.
* Deleting income history, importing/exporting income, or changing period settings.

## Validation

Confirm that opening the manager does not alter stored data; current and historical edits save to
their own period keys; historical edits leave the dashboard's selected period unchanged; and the
manager reflects saved changes when it remains open. Confirm the sheet is usable on iPhone in light
and dark themes.
