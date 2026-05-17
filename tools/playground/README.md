# 071-now

Browser-based WordPress 0.71 — wp-now / WordPress Playground in spirit
(umbrella Issue #104, Phase 3, design `docs/071-tooling.md` section 5).

This package runs WordPress 0.71 entirely in the browser — PHP compiled
to WebAssembly via `@php-wasm/web`, reading posts from an in-browser
SQLite database. No MySQL server, no web server.

It began as the **feasibility spike** of Issue #108 (a proof of concept
that rendered the front page) and is now being grown into a usable
browser-based blog. Step 1 of that full build (Issue #116) serves the
blog through a **service worker** so it has its CSS and is navigable.
Step 2 (Issue #118) trims the php-wasm bundle to PHP 8.3 only.

The spike's findings, including the chosen database approach and the
remaining work for a full `071-now` build, are in
`docs/071-now-spike.md`.

## How it works

1. `scripts/build-overlay.mjs` snapshots `src/` (WordPress 0.71) into
   `tools/playground/wp/` and overlays the 071-now SQLite database layer
   onto that copy. **`src/` itself is never modified** — the overlay only
   touches the generated, git-ignored `tools/playground/wp/` directory.
2. Vite bundles the browser app and the WordPress 0.71 tree.
3. At boot the app registers the request-routing service worker
   (`public/sw.js`), boots `@php-wasm/web`, writes the WordPress 0.71
   tree into the php-wasm virtual filesystem, and registers the 071-now
   boot shim as `auto_prepend_file`.
4. The boot shim seeds a SQLite database with one published post; the
   SQLite-backed `wpdb` (`db/wp-db.php`) serves WordPress 0.71's queries.
5. The app points the iframe at a real scoped same-origin path
   (`/scope:<id>/index.php`). The service worker intercepts that
   navigation and every asset request and link click inside the iframe,
   forwards each one to the app page (which owns the php-wasm request
   handler), and turns the php-wasm response into a `Response`. The blog
   therefore loads its own CSS and is fully navigable.

## The service worker request handler

WordPress 0.71's front page emits absolute asset URLs and internal
links against `$siteurl`. The spike rendered the front-page HTML into a
`blob:` URL iframe, so those requests never reached php-wasm and the
page was unstyled and not navigable.

`public/sw.js` fixes this the way WordPress Playground does. The blog
is served under a single scope path segment (`/scope:<id>/...`):
`src/main.js` rewrites the in-VFS copy of `b2config.php` so `$siteurl`
points at that scoped path, hence every URL the blog emits is
same-origin and scoped. The service worker intercepts exactly those
scoped requests, leaving the app shell and the `.wasm`/`.data` runtime
assets to the network. `src/` and the on-disk overlay are untouched —
only the in-memory php-wasm copy of `b2config.php` is rewritten.

## Trimming the php-wasm bundle to PHP 8.3

`@php-wasm/web` depends on one package per PHP version it supports
(`@php-wasm/web-5-2` … `@php-wasm/web-8-5`), and its
`getPHPLoaderModule` / `getIntlExtensionPath` functions are a `switch`
whose every case is a static `await import('@php-wasm/web-<v>')`.
Rollup resolves every one of those literal-string imports at build
time, so a plain build ships all eight PHP runtimes — roughly 290 MB
of `.wasm`. 071-now boots `@php-wasm/web` with `'8.3'` only, so the
other seven cases are dead branches.

`vite.config.js` carries a `071-now-trim-php-wasm-versions` plugin that
resolves every `@php-wasm/web-<v>` package other than the PHP 8.3 one
to an inert stub module. The stub re-exports the same surface
(`getPHPLoaderModule`, `getIntlExtensionPath`, `jspi`) so the named
imports in `@php-wasm/web` still resolve, but it carries no `.wasm`
import — so Rollup never pulls those runtimes into the build. The
build then emits only the PHP 8.3 `.wasm` files (the asyncify and JSPI
flavors, selected at runtime by browser feature detection).

## Layout

```
tools/playground/
  package.json
  index.html              host page
  vite.config.js
  public/
    sw.js                 request-routing service worker
  src/
    main.js               boots @php-wasm/web, wires the SW bridge
    wp-files.js           build-time bundle of the overlaid WP 0.71 tree
  db/                     the 071-now database layer (overlaid into WP)
    wp-db.php             SQLite-backed reimplementation of 0.71's wpdb
    sql-translator.php    MySQL -> SQLite translation layer
    seed.php              builds the schema, inserts one seeded post
    boot.php              auto_prepend boot shim
  scripts/
    build-overlay.mjs     snapshots src/ + applies the db overlay
  test/
    verify.mjs            headless-Chromium verification
  wp/                     generated overlay (git-ignored)
```

## Commands

```
npm run build      build the overlay and the Vite bundle
npm run dev        Vite dev server
npm run preview    serve the production build
npm run verify     build, serve, and verify in headless Chromium
```

`npm run verify` confirms, in a real browser, that the WordPress 0.71
blog is served through the service worker: the front page renders with
its CSS, and a visitor can click through to a post page and a category
page with no console errors. It writes `test/071-now-frontpage.png`.
