# Plan: React Router + email deep links + mobile-friendly stock view

**Status: IMPLEMENTED 2026-07-08 (Opus). All five phases landed; verified via
eslint + esbuild bundle + a server-side email render test. Live browser smoke
test not run locally — Vite dev won't boot on Node 20.11.1 (needs 20.19+).**
Read `docs/single-source-of-truth-plan.md` first for how the AI Committee
now works (server-side runs, `action=committeeResults`/`runCommittee`,
sync-token auth) — this plan builds on that architecture and must not
regress it.

## Goal

The daily report email lists each holding's verdict. Tapping a symbol in
that email (usually in a **phone mail app → phone browser**) should open the
app directly on that stock's detail view with the **AI Committee tab
active**, readable and usable on a phone. Today neither piece exists: the
app has no URLs (navigation is React state), and the layout is
desktop-first (sidebars + resizable panels).

## Current state (verified 2026-07-08)

- `react-router` **^7.8.2 is already in `client/package.json` but unused**
  — no imports anywhere. No install needed; just wire it up.
- Navigation is two pieces of state in `client/src/App.jsx`:
  - `selectedSymbol` (`null` = home view, else the ticker view)
  - `contextTab` (`0` = News, `1` = AI Committee, passed to
    `StockContextPanel`)
  - `handleSelectSymbol(symbol, { openCommittee })` and `handleGoHome()`
    mutate them; callers include `Navbar`, `NavbarMini`,
    `PortfolioCommitteePanel` cards (`onSelectSymbol`), search, and the
    add-ticker flow.
- Deployed to **GitHub Pages project site**: `https://nnbrandon.github.io/stockjs/`
  (Vite `base: "/stockjs/"` in `client/vite.config.js`).
- `index.html` already has the viewport meta tag.
- Some responsive CSS exists (`App.module.css` has a `max-width: 1100px`
  breakpoint) but nothing designed for phones.
- Email rendering: `server/lib/reportEmail.js` — `holdingHtml(r)` renders
  each symbol as plain `<strong>` text; `holdingText(r)` is the plain-text
  twin. Both must get links.
- The AI Committee tab (`AnalystPanel`) is server-backed via
  `useServerCommittee` and **requires sync credentials** (email + token in
  localStorage; `client/src/utils/reportPortfolioSync.js`). A fresh phone
  browser has neither credentials nor IndexedDB data — both cold-start
  problems are addressed below.

## Decisions (with reasons — don't relitigate without cause)

1. **HashRouter, not BrowserRouter.** GitHub Pages serves static files; a
   BrowserRouter path like `/stockjs/stock/AAPL` 404s on direct load unless
   we ship the `404.html` copy-hack, which is fragile and adds a redirect
   hop that some mail-app in-app browsers handle poorly. Hash URLs
   (`/stockjs/#/stock/AAPL/committee`) load `index.html` directly, need no
   server tricks, and survive email-client URL rewriting (link-tracking
   wrappers preserve the fragment). Ugliness is acceptable; reliability
   from a mail app is the whole point.
2. **URL is the source of truth for navigation.** Replace the
   `selectedSymbol`/`contextTab` state with route params (`useParams`,
   `useSearchParams`/path segment). Don't keep parallel state that can
   drift — derive.
3. **Mobile = responsive CSS + conditional layout, not a separate app.**
   One breakpoint (`<= 768px`) where the desktop three-panel layout
   becomes a single-column stacked view. No user-agent sniffing.
4. **No auth material in email links.** Deep links carry only the symbol.
   The committee tab on an unconfigured browser shows the existing
   "set up sync" prompt (one-time per device). Do NOT put the sync token
   in URLs — emails get forwarded, URLs land in server logs and browser
   history.

## Routes

```
#/                     home (portfolio panel, watchlist, trending)
#/stock/:symbol        stock detail, News tab active
#/stock/:symbol/committee   stock detail, AI Committee tab active
*                      redirect to #/
```

- `:symbol` must be validated/normalized on entry: uppercase, match
  `/^[A-Z0-9.\-]{1,12}$/` (same regex as `server/handlers/committee.js`);
  invalid → redirect home. The email builds these URLs from server-side
  symbols, but users will also hand-edit them.
- Tab changes (News ↔ AI Committee) should `navigate(..., { replace: true })`
  so the back button leaves the stock view instead of cycling tabs.
- Back button from a deep-linked stock view (empty history stack) should
  still work: the navbar Home button navigates to `#/`, so no special
  handling needed beyond it existing.

## Implementation

### Phase 1 — Router wiring (client)

1. `client/src/main.jsx`: wrap `<App />` in `<HashRouter>` (import from
   `react-router`; v7 exports HashRouter from the main package —
   `react-router-dom` is not needed as a separate dep in v7).
2. `client/src/App.jsx`:
   - Delete `selectedSymbol`/`contextTab` state. Derive them from the
     route: a `<Routes>` with the three routes above; the stock routes
     render the existing ticker view, home renders the existing home view.
     The simplest surgical approach: keep App's single-component structure,
     read `const { symbol } = useParams()` in a small wrapper route
     component that passes it down, or use `useMatch` in App itself.
   - `handleSelectSymbol(symbol, { openCommittee })` →
     `navigate(openCommittee ? \`/stock/${symbol}/committee\` : \`/stock/${symbol}\`)`.
   - `handleGoHome()` → `navigate("/")`.
   - `contextTab` becomes derived: `/committee` suffix ⇒ 1, else 0;
     `onTabChange` navigates (replace) between the two paths.
   - `handleDelete` (removes a ticker) currently calls `handleGoHome()` —
     keep that, now a navigate.
   - Everything else (data hooks keyed on `selectedSymbol`) keeps working
     because the derived `selectedSymbol` feeds the same props.
3. Grep for every `handleSelectSymbol`/`onClickSymbol`/`onSelectSymbol`
   call site and confirm they still work through the new functions —
   they should, since the function signatures stay identical.
4. **Watch out:** `sessionCache`-style module state
   (`utils/committeeServerCache.js`) is unaffected by routing; do not touch.

### Phase 2 — Deep links in the email (server)

1. `server/lib/reportEmail.js`:
   - Add `const APP_URL = process.env.APP_URL || "https://nnbrandon.github.io/stockjs";`
     (module-level, or better: pass through `meta` from `dailyReport.js`
     so the renderer stays env-free and testable — preferred).
   - `stockUrl(symbol)` → `${appUrl}/#/stock/${encodeURIComponent(symbol)}/committee`.
   - In `holdingHtml`: wrap the symbol `<strong>` in
     `<a href="..." style="color:#0969da;text-decoration:none;">` for BOTH
     the rated row and the unrated/fund/error rows. Keep the existing font
     styling on the inner element; test that Gmail doesn't strip it (inline
     styles only, as the rest of the template already does).
   - In `holdingText`: append the URL on its own indented line under each
     symbol.
   - Optionally add one "Open your portfolio" link near the header →
     `${appUrl}/#/`.
2. `server/handlers/dailyReport.js`: put `appUrl` into `meta`.
3. `server/scripts/setup-daily-report.sh`: add `APP_URL` to the merged env
   vars (default the GitHub Pages URL, override with `APP_URL=...`).
   Follow the existing merge pattern — and note the script now has an
   idempotent config-apply block; adding a var means the comparison will
   correctly trigger one write.

### Phase 3 — Mobile layout (client)

The target experience on a phone (mail app → `#/stock/AAPL/committee`):

1. **Global**: at `<= 768px`, the app becomes single-column. The left
   navbar collapses to a slim top bar or hamburger (`NavbarMini` already
   exists as a slim variant — check whether it can serve as the mobile
   bar before building anything new). Resizable sidebars
   (`ResizableSidebar`) must not render their drag handles on touch
   layouts — hide via media query.
2. **Stock view on mobile**: stack vertically — compact header (symbol,
   price), then the tabbed context panel (News / AI Committee) full-width,
   then the chart (or chart collapsed behind a toggle; committee content
   is the priority for the email-arrival use case). `StockContextPanel`
   currently renders as a right-hand sidebar with a fixed `panelWidth` —
   on mobile it becomes `width: 100%` and the resize affordances disappear.
3. **AnalystPanel on mobile**: it's mostly text/cards and already has a
   `compact` prop — verify card grids (`GamePlan`'s `planGrid`, pillars
   row) wrap on narrow screens; adjust their module CSS with a media query
   rather than new components.
4. **Home view on mobile**: portfolio committee panel full-width, stacked
   above/below the watchlist. Fine to keep simple — the email use case
   lands on the stock view, home just must not be broken.
5. Touch targets ≥ 40px for the tab bar and buttons; no hover-only
   affordances for critical actions.
6. Test matrix: iOS Safari (what Mail opens), plus Chrome mobile emulation
   in dev. Portrait 390px width is the design target.

### Phase 4 — Cold-start on a fresh phone browser

Two gaps when the deep link opens on a device that has never run the app:

1. **No IndexedDB data** (candles/fundamentals/news for the chart and
   position card). The stock route must detect "symbol not stored" and
   fetch/persist the data with a loading state — but **viewing a symbol
   must NOT add it to the watchlist** (product decision, 2026-07-08).
   Deep-linking or browsing to a ticker shows its full detail page; the
   user explicitly opts in to tracking it.

   This requires splitting two concepts the codebase currently conflates:
   - **Data cache** (IDB stores: candles, fundamentals, earnings, news) —
     any viewed symbol gets seeded here so the page works.
   - **Watchlist membership** — currently DERIVED from the data cache
     (`getStoredSymbols` = distinct symbols in the stockData store, feeds
     the Navbar list). Introduce an explicit membership store (a small
     Dexie store `watchlist: "symbol"` via a new schema version — follow
     the versioning rules in `db/database.js`; do NOT edit released
     versions). Migration: on upgrade, populate membership from the
     current `storedSymbols` so nobody's existing watchlist changes.
   - `useStoredSymbols`/Navbar then read membership, not the data cache.
     `addSymbolToWatchlist` = seed data + add membership (unchanged
     behavior for search/add-ticker flows). The stock route's cold-start
     seed = data only, no membership.
   - **"Add to watchlist" button, top-right corner of the stock details
     page**, shown only when the viewed symbol isn't a member (holdings
     and existing watchlist symbols show nothing, or a subtle ✓). Tapping
     it adds membership (data is already seeded) and updates the Navbar.
     Must be reachable on mobile (the top-right of the stock view header
     at 390px, not buried in a collapsed sidebar).
   - `deleteSymbolData` (remove-ticker flow) must also remove membership.
   - The Fidelity portfolio import must add membership for every imported
     holding (today they appear in the watchlist implicitly via their
     seeded data; with the split that stops being automatic — grep the
     import flow for where symbols get seeded and add membership there).
   - **Nonexistent-but-well-formed ticker** (`#/stock/ZZZZZ` passes the
     format regex, then the Yahoo fetch fails): the route must catch the
     seed failure and render a clear error state ("Couldn't find data for
     ZZZZZ") with a link home — not a spinner forever, not a crash, and
     nothing persisted to IDB for the bad symbol.
2. **No sync credentials** → the AI Committee tab already renders a
   "set up the email report first (sidebar → Sync email report)" prompt
   (`AnalystPanel`, `unconfigured` status). On mobile ensure that prompt
   includes a button that OPENS the sync modal directly (the sidebar may
   be collapsed/hidden on phones — "go find it in the sidebar" is a dead
   end on a 390px screen). The modal's "Email me a sync token" flow works
   fine on a phone.
   - **Known caveat to surface in the modal copy or accept silently:**
     requesting a new token replaces the old one server-side
     (`tokens/<email>.json` holds one hash), so setting up the phone
     invalidates the desktop's saved token (desktop dev setups using
     `.env.local` with the master token are unaffected). Acceptable for
     now; a multi-token store is a possible follow-up, not in scope.

### Phase 5 — Browse-first navigation: search input + trending

With viewing decoupled from the watchlist (Phase 4), browsing flows stop
mutating the watchlist:

1. **Search input for browsing.** Add a search box that navigates to
   `#/stock/SYM` — it does NOT add to the watchlist (the detail page's
   top-right Add button is the opt-in). Reuse the existing
   `hooks/useSymbolSearch.js` (debounced `LambdaService.searchSymbols`)
   for typeahead results; render name + symbol, Enter/tap navigates.
   Placement: in the top bar so it exists on both home and stock views;
   on mobile it can collapse to a search icon that expands. The existing
   `AddTickerModal` keeps its own search + add flow unchanged (it's the
   explicit "add a ticker" action) — do not merge the two in this pass.
2. **Trending stocks (Home) become pure navigation.** Today
   `components/TrendingStocks/TrendingStocks.jsx` → `handleSelect` calls
   `addSymbolToWatchlist(symbol)` for unknown symbols before selecting —
   remove that: clicking a trending tile just navigates to
   `#/stock/SYM`. This deletes the `addingSymbol` spinner state and the
   `watchlistSymbols`/`onWatchlistChange` props (check both call sites —
   `HomeView` and anywhere else — and clean up the prop plumbing). Data
   loading for the clicked symbol is handled by the stock route's
   cold-start seeding from Phase 4; the Add button on the detail page is
   how a trending stock earns a watchlist spot.

## Verification (local Node is 20.11.1 — Vite build FAILS locally; use these)

- `cd client && npx eslint src` (pre-existing errors exist in
  `LineChart.js`, `EarningsDetailContent.jsx`, `StockActions.jsx` — do not
  add new ones).
- Bundle check:
  `npx esbuild src/App.jsx --bundle --format=esm --outfile=/tmp/app.js
  --loader:.jsx=jsx --loader:.js=jsx --loader:.css=empty --loader:.svg=empty
  --loader:.png=empty "--alias:@stockjs/committee-engine=../packages/committee-engine/src"`.
- Run dev (`npm run dev` in client; `client/.env.local` already points dev
  at the deployed Lambda with working credentials) and manually verify:
  - `http://localhost:5173/stockjs/#/stock/AAPL/committee` deep-loads the
    committee tab (note: dev serves at the `/stockjs/` base).
  - Back/forward, tab switching, home button, ticker delete.
  - Chrome devtools mobile emulation at 390px: stock view, committee tab,
    sync-setup prompt path.
  - Browse-first flows: search → navigate to a symbol NOT on the watchlist
    → detail page loads (seeded), watchlist unchanged, Add button visible
    top-right → tap Add → appears in Navbar. Trending tile click does the
    same (no auto-add, no spinner-on-tile).
- Server: `cd server && npm run bundle && REPORT_SYMBOLS="AAPL:10:150"
  REPORT_EMAIL=test@example.com node scripts/dry-run-report.mjs` — open the
  dry-run HTML it writes to /tmp and confirm each symbol is a working link
  with the `#/stock/SYM/committee` shape.
- The real end-to-end: push (deploys client + server), force a report send,
  tap a symbol link in the actual email on a phone.

## Non-goals / explicitly out of scope

- BrowserRouter/clean URLs (would need the GH Pages 404 hack — not worth it).
- Auth-in-URL magic links (security downgrade; revisit only with signed,
  expiring, read-only links).
- Multi-token-per-email support (noted caveat above; separate follow-up).
- Native app / PWA install flow (a `manifest.json` + icon would be a nice
  cheap add-on if time permits, but don't let it expand the diff).
- Redesigning desktop layout — desktop must look identical after Phase 1–2.
