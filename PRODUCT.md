# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML, CSS, and JavaScript packaged as an installable PWA and hosted on GitHub Pages.

## Users

One Vietnamese-speaking owner uses Silo on their personal iPhone to record day-to-day spending manually.

## Product Purpose

Silo gives its owner a fast, private view of manually entered income for a configurable spending period, expenses already recorded, and money still available. Success means a transaction can be recorded in a few taps and the current period is immediately understandable.

## Positioning

Silo is a deliberately small, local-first personal spending tool: no bank connection, no account, no server, no shared household, and no automatic financial-data ingestion.

## Operating Context

- Installed from GitHub Pages to the iPhone Home Screen and used like a standalone app.
- Used primarily one-handed immediately after a purchase.
- Works offline after installation.
- Each spending period has independently entered income and starts fresh; unused money does not roll over.
- The owner chooses the recurring day of month on which a spending period begins.

## Capabilities and Constraints

- The owner manually enters income for each spending period.
- The owner selects a recurring period-start day from 1 through 31.
- The owner manually creates, edits, and deletes expenses.
- Each expense has a title, positive VND amount, date, and category.
- The app shows period income, spent amount, remaining amount, percentage used, and category totals.
- The amount field must open the iPhone numeric keyboard and offer a visible `000` shortcut.
- Data stays in browser storage on the iPhone. GitHub stores and serves code only.
- Existing stored expenses must remain usable after the upgrade.
- No bank integration, cloud account, server database, automatic synchronization, data export, or data restore.
- The app and interface language are Vietnamese; currency is VND.

## Brand Commitments

- Product name: Silo.
- Preserve the existing product's direct, compact Vietnamese voice.
- The interface may be visually redesigned, but it must remain easy to scan and operate on an iPhone.

## Evidence on Hand

- Existing implementation: `index.html`, `manifest.json`, `sw.js`, and `icons/`.
- Current deployed product supports local expense CRUD, month navigation, category filtering and management, offline caching, and Home Screen installation.
- No external brand assets, research, or analytics are available; future work must not fabricate them.

## Product Principles

1. Recording an expense is the shortest path in the product.
2. Remaining money in the current spending period is more important than analytics.
3. Financial data stays local and understandable to the owner.
4. Native-feeling iPhone controls and clear feedback outrank decorative complexity.
5. Add only features that directly improve manual spending-period control.

## Accessibility & Inclusion

The primary interface must remain usable at iPhone text-size settings, avoid color-only status communication, provide readable contrast, and give all interactive controls clear accessible names and touch targets.
