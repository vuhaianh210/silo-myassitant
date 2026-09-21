# Period start day and end day — design

Status: design approved by the owner on 2026-09-21; this document is the reviewed spec.
Supersedes the earlier end-day-only sketch (that variant required a one-month income-key
migration; this one does not).

## Problem

Silo has a single recurring setting, `cycleStartDay` (1–31, stored in `silo_cycle_start_day`).
The period's end is derived: `end = day before the next period's start`, so periods always tile
the calendar with no gaps and the owner cannot control the end at all.

The owner wants to choose **both** the start day and the end day, and accepts that a period may
be shorter than a month, leaving days that belong to no period.

## Model

Two recurring day-of-month settings, `S` (start) and `D` (end), each an integer 1–31.
Periods are indexed by a month slot `M` (`YYYY-MM`). `dim(X)` is the number of days in month `X`,
`min` is clamping to the real length of the month.

```
start(M) = M - min(S, dim(M))
end(M)   = (D >= S ? M : M + 1) - min(D, dim(D >= S ? M : M + 1))
end(M)   = min(end(M), start(M + 1) - 1)          # ceiling clamp
```

* `D >= S` — the period lies inside month `M` ("same-month").
* `D < S` — the period runs from month `M` into month `M+1` ("crossing"), which is how the
  current derived model behaves.
* The ceiling clamp exists so the end can never reach into the next period. It only ever binds
  in the crossing case where `dim(M+1) <= D`.

**Period identity.** The key of a period is the month in which it **starts** — identical to
today's key. Therefore `silo_period_incomes` keys keep their current meaning (see Compatibility).

### Invariants

These are the correctness contract; each is covered by an exhaustive test.

1. **No overlap.** `end(M) < start(M + 1)` for every `M`, `S`, `D`. Without the ceiling clamp,
   `S = 31, D = 30` would put 28/02 in two periods.
2. **No duplicate keys.** Exactly one period exists per month slot `M`, so two periods can never
   share a key and two incomes can never overwrite each other.
3. **Every date belongs to at most one period.** It may belong to none: that is a *gap*, and gaps
   occur only when `D >= S`.

### Verification performed before this spec was written

The formulas above were executed against the current `periodBounds` before any implementation:

* every `S` in 1–31 over 24 consecutive months with `D = S - 1` reproduces today's `startDate`
  and `endDate` exactly — **0 mismatches**, which is what makes the no-migration claim true;
* all 961 `(S, D)` pairs satisfy invariants 1–3 over 24 months — **0 overlaps, 0 duplicated keys,
  0 days belonging to more than one period, 0 inverted periods**;
* the worked-case table below matches, including the February clamp rows.

The first run of that check reported 20 overlaps and 14 mismatches; the cause was an off-by-one in
the throwaway check script's clamp, not in the formula. The corrected run is the one reported above.

### Worked cases

| `S`, `D` | Period | Note |
|---|---|---|
| `1, 31` | 01/03–31/03 | whole calendar month; same as today |
| `25, 24` | 25/09–24/10 | crossing, no gap; same as today |
| `5, 20` | 05/09–20/09 | same-month; 21/09–04/10 is a gap |
| `31, 30` | 31/01–27/02 | clamp binds: 28/02 would have overlapped the next period |
| `30, 29` | 30/01–27/02 | clamp binds in February only |
| `5, 5` | 05/09–05/09 | one-day period |
| `31, 15` | 31/01–15/02 | crossing with a gap afterwards |

### Resolving a date to a period

```
periodKeyForDate(date, S, D)  -> the latest period whose startDate <= date
```

If that period's `endDate < date`, the date is in a gap; the returned period is the one that just
ended. This single rule is used both for choosing the period shown when the app opens and for
deciding whether an expense lies outside every period.

## Storage and compatibility

* `silo_cycle_start_day` keeps its name and meaning; `saveCycleStartDay` is unchanged.
* New: `silo_cycle_end_day` (`saveCycleEndDay`, validated 1–31).
* **Default when the end day is absent: `D = S - 1`, with `S = 1` mapping to `D = 31`.**
* **No data migration.** `D = S - 1` plus the ceiling clamp reproduces today's periods exactly,
  for every `S` including 29, 30 and 31, and including February in leap and non-leap years. That
  identity is a required test, not an assumption.
* Expenses are stored with dates and are regrouped by the period filter, as they already are when
  the cycle day changes. Income entries are keyed by the period's start month — unchanged — so no
  income is reinterpreted or moved.
* If the stored end day is malformed or out of range, fall back to `S - 1` rather than failing the
  load (the existing repository already falls back this way for `cycleStartDay`).

## Interface

**Settings sheet** (`#periodSettingsSheet`), replacing the single start-day field:

* Two number inputs labelled `Bắt đầu ngày` and `Kết thúc ngày`, both 1–31, both validated with
  the existing inline error pattern.
* A live preview of the resulting range for the **period currently displayed in the app**
  (`state.selectedPeriodKey` recomputed with the draft values), e.g. `31/01 → 27/02`, updated as
  either input changes. This is what makes the February clamp visible instead of silent.
* When the draft pair produces gaps, a concrete warning naming the gap that follows the previewed
  period: `Có 29 ngày không thuộc kỳ nào (21/09–19/10)`.
* On save, the confirm dialog names the number of **all currently stored expenses** that would fall
  in a gap under the draft pair, counted across every date, not only the displayed period:
  `5 khoản chi sẽ không thuộc kỳ nào`.

**Period navigation.** The period title is the date range (`25/09–24/10`); `Kỳ tháng X` is removed
because the period no longer belongs to one month. The secondary line reads
`Bắt đầu ngày 25 · Kết thúc ngày 24`.

**Reaching expenses in a gap.** Expenses that belong to no period remain editable and deletable:

* A collapsed section `Ngoài kỳ (N)` at the end of the expense list, rendered only when `N > 0`,
  listing those expenses with the same swipe-to-reveal `Sửa` / `Xóa` actions as ordinary rows.
* `N` is global: it counts every stored expense that falls in a gap under the current pair,
  independent of which period is being viewed or which category filter is active.
* The section honours the active category filter, so its contents stay consistent with the filter
  chips above it. An expense hidden by the filter is still reachable by clearing the filter.
* Membership test per expense: resolve `periodKeyForDate(expense.date, S, D)` and compare the
  expense date against that period's bounds; outside means gap.

## Tests

`tests/logic.test.js`

* Exhaustive sweep: every `S` in 1–31 × every `D` in 1–31 × 24 consecutive month slots asserts
  invariants 1, 2 and 3, and that `start(M) <= end(M)`.
* `periodBounds` for `(1,31)`, `(25,24)`, `(5,20)`, `(31,30)`, `(30,29)`, `(5,5)`, `(31,15)`,
  including February in a leap and a non-leap year.
* `periodKeyForDate` round-trips: for every date in a sweep, the returned period contains it, or
  the date is a gap day.
* Gap accounting: the number of gap days and the number of outside-period expenses are exact.

`tests/storage.test.js`

* A legacy state with only `silo_cycle_start_day` loads with `endDay = startDay - 1` and produces
  the same ranges as before, with income keys untouched.
* `S = 1` legacy maps to `D = 31`.
* Malformed or out-of-range `silo_cycle_end_day` falls back to `S - 1`.
* Saving both days persists and round-trips.

## Documentation

`PRODUCT.md`:

* Operating Context: the owner chooses the recurring day the period starts **and** the recurring
  day it ends.
* Capabilities: note that a period may be shorter than a month and that days between the end and
  the next start belong to no period; expenses recorded there are surfaced under `Ngoài kỳ`.

## Out of scope

* Choosing an end **date** per individual period (rejected: the owner wants one recurring pair).
* Export, backup, restore — still explicitly excluded by `PRODUCT.md`.
* Any income migration.

## Accepted trade-offs

* Gap days hold expenses that belong to no period. They stay reachable only through the
  `Ngoài kỳ` section; they never appear in any period's totals. The owner accepted this and asked
  for the warning instead of prevention.
* In the crossing case with `D >= 28`, the ceiling clamp shortens the period by a day in months
  whose length falls between `D` and `S`. The live preview in the settings sheet shows it.
