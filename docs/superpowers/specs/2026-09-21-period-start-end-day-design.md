# Period end day, with a start anchor — design

Status: **revision 2**, 2026-09-21. Revision 1 (two independent recurring days, gaps allowed) is
superseded: the owner confirmed that periods must stay gap-free, and that with
`start 21 / end 10` the next period starts on the **11th**, not the 21st.

Superseded means: the start day does **not** recur. The recurring setting is the end day; the start
day anchors the first period only. This revision also reintroduces a one-time income-key migration
that revision 1 had avoided.

## Problem

Silo has one recurring setting, `cycleStartDay` (1–31, `silo_cycle_start_day`). The end is derived
as *the day before the next period's start*, so the owner cannot choose the end at all.

The owner wants to choose both days while keeping periods contiguous. Their own example:
"start 21, end 10" must produce `21/09 → 10/10`, then `11/10 → 10/11`, then `11/11 → 10/12`.
Arithmetic forces the consequence: from the second period on, the start is always
`end day + 1`, so a *recurring* start day is impossible without leaving gaps. The start day is
therefore an **anchor for the first period**, and the end day is the recurring boundary.

## Model

Two settings:

* `D` — end day, 1–31, recurring.
* `A` — anchor: the calendar date on which the first period starts. Optional; empty means the chain
  extends backwards without limit.

With `dim(X)` the number of days in month `X`:

```
B(M)              = min(D, dim(M))                      # the monthly end boundary
period ending M   = [ B(M - 1) + 1 , B(M) ]              # contiguous by construction
key(M)            = M                                    # the month the period ENDS in
first period      = the earliest period whose B(M) >= A, with its start replaced by A
periods with B(M) < A do not exist
```

### Invariants

1. **Contiguous.** `end(M) + 1 day == start(M + 1)`. Gaps are impossible, with or without an anchor.
2. **One key per month, never duplicated.** The key is the month the period ends in, so exactly 12
   keys per year and two incomes can never collide. This is *why* the key moves off the start
   month: with the chain, `D >= 29` makes two consecutive periods start in the same month
   (`D = 29`: the period ending 29/03 starts 01/03 and the one ending 29/04 starts 30/03).
3. **Every date on or after `A` belongs to exactly one period.** Dates before `A` belong to none —
   that is pre-history, not a gap.

### Worked example (`D = 10`, `A = 2026-09-21`)

| Period | Range | Start is |
|---|---|---|
| ends 2026-10 | 21/09 → 10/10 | the anchor |
| ends 2026-11 | 11/10 → 10/11 | `D + 1` |
| ends 2026-12 | 11/11 → 10/12 | `D + 1` |
| ends 2027-01 | 11/12 → 10/01 | `D + 1` |

## Verification performed before writing this spec

The formulas were executed against the current `periodBounds` before any implementation:

* **Invariants 1–3 for all 31 `D` values over 30 months: 0 contiguity breaks, 0 inverted periods,
  0 key collisions.**
* **Legacy equivalence with `D = S - 1`: exact for every `S` from 1 to 28** across 24 months —
  legacy `startDay = S` and `D = S - 1` produce byte-identical ranges, so nothing moves for those
  users and `S = 1` maps to `D = 31` with no key shift.
* **Measured deviations, `S` in 29–31 only:** `S = 29` → 4 of 24 months; `S = 30` → 4 of 24;
  `S = 31` → 20 of 24. The legacy end is derived from the *next start* (clamped in the following
  month) while the chain ends at `min(D, dim(month))`, so those boundaries differ by one day. An
  expense can therefore change period at a February edge for these three legacy values.
* The worked example above was reproduced exactly, and the run asserts period 1 starts at the
  anchor while every later period starts on the 11th.

Two bugs were found and fixed **in the throwaway check script** during this verification (a
boundary artefact that faked 27 legacy mismatches, and a demo that emitted the anchored period
twice). Neither was in the formulas; recording them so the implementer does not repeat them, and
because the first run's alarming numbers should not be mistaken for real ones.

## Storage and migration

* New `silo_cycle_end_day` (`saveCycleEndDay`, 1–31).
* New `silo_cycle_anchor` (a `YYYY-MM-DD` date, or absent). Absent means no anchor.
* **Legacy migration, run once when `silo_cycle_start_day` is present:**
  1. `D = (S === 1 ? 31 : S - 1)`.
  2. Shift every `silo_period_incomes` key by **+1 month** when `S >= 2`, unchanged when `S = 1`.
     The shift is required because the key moves from the start month to the end month; without it
     an existing income would be read as belonging to the wrong period.
  3. Delete `silo_cycle_start_day` **only after** the income write succeeded. On any write failure,
     leave the legacy key in place so the migration runs again on the next load — fail closed, no
     income is lost or duplicated. Writing the same shifted keys twice is idempotent.
* Malformed or out-of-range `silo_cycle_end_day` falls back to `S - 1` when a legacy key is present,
  otherwise to `31` (which clamps to the last day of whatever month it lands in), matching the
  repository's existing fallback style.
* Expenses need no migration: they store dates and are regrouped by the period filter, exactly as
  they already are when the cycle day changes.

## Interface

**Settings sheet** (`#periodSettingsSheet`):

* `Kết thúc kỳ — ngày` : number, 1–31. The recurring boundary.
* `Kỳ đầu tiên bắt đầu` : date, clearable. Empty = no anchor.
* A live preview of the resulting sequence, e.g.
  `Kỳ này: 21/09 → 10/10 · Kỳ sau: 11/10 → 10/11`, recomputed as either field changes. This is what
  makes the "start does not recur" consequence visible instead of surprising.
* Saving shows a confirm dialog in the existing style, naming what changes when income keys shift:
  `Thu nhập của các kỳ cũ sẽ được dịch sang kỳ mới. Tiếp tục?`

**Period navigation.** Title = the date range (`21/09 → 10/10`); the `Kỳ tháng X` label is removed
because a period spans two months. The `‹` control is disabled on the first period when an anchor
is set. The secondary line reads `Kết thúc ngày 10`.

**Expenses dated before the anchor.** They belong to no period, so they would otherwise be
unreachable. A collapsed section `Trước kỳ đầu (N)` at the end of the expense list, rendered only
when `N > 0`, lists them with the same swipe-to-reveal `Sửa` / `Xóa` actions. It honours the active
category filter and counts globally.

## Tests

`tests/logic.test.js`

* For every `D` 1–31 over 30 months: contiguity (`end + 1 == next start`), `start <= end`, and
  distinct keys.
* `D = 29` and `30` specifically assert that two periods never share a key (the collision that
  forced the key change).
* The anchored sequence: `D = 10`, anchor `2026-09-21` produces the four ranges in the table above,
  the first start equals the anchor, every later start is the 11th, and no period exists whose end
  precedes the anchor.
* `periodKeyForDate` round-trips: every date on or after the anchor resolves to a period that
  contains it; every earlier date resolves to "before the anchor".

`tests/storage.test.js`

* A legacy state with `silo_cycle_start_day = S` migrates to `D = S - 1`, shifts income keys by one
  month for `S >= 2`, leaves them alone for `S = 1`, and removes the legacy key.
* Ranges after migration equal the ranges before it for every `S` from 1 to 28.
* A write failure during migration keeps the legacy key and leaves the incomes unshifted.
* Running the migration twice is a no-op (idempotent).
* Malformed end day and malformed anchor fall back without failing the load.

## Documentation

`PRODUCT.md`:

* Operating Context: the owner chooses the recurring day on which a period **ends**, and optionally
  the date the first period starts.
* Capabilities: periods run contiguously from the anchor; the start day is not recurring; expenses
  dated before the anchor are surfaced under `Trước kỳ đầu`.

## Out of scope

* Per-period end dates (rejected earlier by the owner).
* Any change to expense storage.
* Export, backup, restore — still excluded by `PRODUCT.md`.

## Accepted trade-offs

* **The start day does not recur.** Choosing "start 21, end 10" gives 21/09–10/10 and then
  11/10–10/11. This is arithmetic, not a design preference, and the live preview shows it.
* **Legacy `startDay` 29, 30 or 31 shifts a boundary by one day** in some months (measured above:
  4, 4 and 20 months out of 24). Expenses regroup; the income amount stays with its period.
* **The anchor defaults to unset** (owner-confirmed 2026-09-21). Existing data and behaviour are
  therefore untouched until the owner deliberately sets an anchor; the alternative of defaulting it
  to the period holding the earliest stored expense was rejected as the app writing a value into
  the owner's data on its own.
