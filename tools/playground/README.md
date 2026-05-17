# 071-now

Browser-based WordPress 0.71 — wp-now / WordPress Playground in spirit
(umbrella Issue #104, Phase 3, design `docs/071-tooling.md` section 5).

This package runs WordPress 0.71 entirely in the browser — PHP compiled
to WebAssembly via `@php-wasm/web`, reading posts from an in-browser
SQLite database. No MySQL server, no web server.

It is deployed to GitHub Pages at
<https://mt8.github.io/wordpress-0.71-gold/>, so anyone can launch it
from a link (Issue #128); see [Deployment](#deployment) below.

It began as the **feasibility spike** of Issue #108 (a proof of concept
that rendered the front page) and was then grown into a usable
browser-based blog over six steps. Step 1 of that full build (Issue
#116) serves the blog through a **service worker** so it has its CSS
and is navigable. Step 2 (Issue #118) trims the php-wasm bundle to PHP
8.3 only. Step 3 (Issue #120) makes the **WordPress 0.71 admin** work —
the admin opens already logged in, and a post can be created, edited
and a category managed through it, with the change reflected on the
front page. Step 4 (Issue #122) **persists the SQLite database** in the
browser, so content created through the admin survives a page reload /
tab close. Step 5 (Issue #124) makes **image upload** work — an image
uploaded through the classic admin's `b2upload.php` is stored in the
php-wasm VFS, served on the blog, and persisted so it survives a reload
too. Step 6 (Issue #126) is the **final polish**: a fresh playground
opens on a small seeded demo blog, a loading splash covers the php-wasm
boot, and the host page frames the playground and links back to the
repository.

The spike's findings, including the chosen database approach and the
remaining work for the full `071-now` build, are in
`docs/071-now-spike.md`; the build's six-step phasing is recorded in
`docs/071-tooling.md` section 5.

## How it works

1. `scripts/build-overlay.mjs` builds the block-editor app
   (`tools/block-editor/`), then snapshots `src/` (WordPress 0.71,
   including the freshly built `src/block-editor/assets/`) into
   `tools/playground/wp/` and overlays the 071-now SQLite database layer
   onto that copy. **`src/` itself is never modified** — the overlay only
   touches the generated, git-ignored `tools/playground/wp/` directory
   (and the block editor's own git-ignored build output).
2. Vite bundles the browser app and the WordPress 0.71 tree.
3. At boot the app registers the request-routing service worker
   (`public/sw.js`), boots `@php-wasm/web`, writes the WordPress 0.71
   tree into the php-wasm virtual filesystem, and registers the 071-now
   boot shim as `auto_prepend_file`.
4. The boot shim seeds a SQLite database with one published post and an
   admin user, auto-logs-in that admin, and `chdir()`s to the requested
   script's directory; the SQLite-backed `wpdb` (`db/wp-db.php`) serves
   WordPress 0.71's queries.
5. The app points the iframe at a real scoped same-origin path
   (`/scope:<id>/index.php`). The service worker intercepts that
   navigation and every asset request and link click inside the iframe,
   forwards each one to the app page (which owns the php-wasm request
   handler), and turns the php-wasm response into a `Response`. The blog
   therefore loads its own CSS and is fully navigable.

## The service worker

`public/sw.js` is a single service worker doing two jobs (Issue #116,
#128).

### Request routing

WordPress 0.71's front page emits absolute asset URLs and internal
links against `$siteurl`. The spike rendered the front-page HTML into a
`blob:` URL iframe, so those requests never reached php-wasm and the
page was unstyled and not navigable.

The worker fixes this the way WordPress Playground does. The blog is
served under a single scope path segment (`<base>scope:<id>/...`):
`src/main.js` rewrites the in-VFS copy of `b2config.php` so `$siteurl`
points at that scoped path, hence every URL the blog emits is
same-origin and scoped. The service worker intercepts exactly those
scoped requests and forwards them to the controlling page (which owns
the php-wasm request handler). `src/` and the on-disk overlay are
untouched — only the in-memory php-wasm copy of `b2config.php` is
rewritten.

### Cross-origin isolation

php-wasm runs PHP threads on `SharedArrayBuffer`, which a browser
exposes only to a cross-origin-isolated page — one served with the
`Cross-Origin-Opener-Policy: same-origin` /
`Cross-Origin-Embedder-Policy: require-corp` headers. The Vite dev /
preview server sets them (`vite.config.js`), but GitHub Pages cannot
set custom HTTP headers. So the same service worker adds them: every
request that is *not* a scoped blog request — the host document, the
bundled JS, the `.wasm`/`.data` runtime assets — is fetched from the
network and re-served with the COOP/COEP (and a `Cross-Origin-Resource-
Policy`) headers attached. This is the `coi-serviceworker` technique,
folded into the one existing worker rather than a second registration.

On the first visit the host document is fetched before the worker
controls the page, so it carries no COOP/COEP and the page is not yet
isolated. `src/main.js` reloads once (guarded by a `sessionStorage`
flag) so the reload's document request goes through the now-controlling
worker; the reloaded page is cross-origin-isolated. On the local dev /
preview server the headers are already present, so no reload happens.

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

## The WordPress 0.71 admin

The admin (`wp-admin/`) works in the playground. Three things, named by
the spike (`docs/071-now-spike.md`), made it possible:

- **The SQL translator** (`db/sql-translator.php`) covers the admin's
  query shapes — the post / category `INSERT` / `UPDATE` / `DELETE`, the
  archive `SELECT`s. A MySQL auto-increment column treats an explicit 0
  as "assign the next id", which SQLite does not, so the translator
  drops a leading `id` column whose value is 0; and the archive queries'
  bare `YEAR(post_date)` columns are aliased back to their MySQL name so
  the admin code finds them.
- **The direct `mysqli_*` call sites.** A few 0.71 functions bypass the
  `wpdb` methods and call `mysqli_*` directly on `$wpdb->dbh`, which is
  a `PDO` here, not a `mysqli` handle. `db/mysqli-compat.php` declares
  `wp071_db_*` helpers over the SQLite `wpdb`, and `build-overlay.mjs`
  rewrites every such site in the in-browser copy to those helpers.
- **Auto-login.** 071-now is a single-user browser playground, so the
  boot shim injects the seeded admin's `wordpressuser` / `wordpresspass`
  cookies into `$_COOKIE`, and the admin opens already logged in.

`src/` is never touched — the translator extension, the `mysqli_*`
rewrite and the auto-login all live under `tools/playground/` and apply
only to the generated `tools/playground/wp/` tree.

## Persisting the SQLite database

The blog's content lives in a single in-browser SQLite file inside the
php-wasm virtual filesystem. That filesystem is discarded when the tab
closes, so on its own the playground re-seeds a fresh database for every
php-wasm instance and a post created through the admin is lost on
reload. Step 4 (Issue #122) persists that file in the browser.

`src/persistence.js` is the persistence layer. It stores the raw bytes
of the SQLite file in the browser:

- **OPFS** (the Origin Private File System) — the modern per-origin file
  store — when it is actually usable. The layer does not trust feature
  detection alone: an engine can expose the OPFS API yet fail at the
  first call (Safari lacks `createWritable` on the main thread; WebKit
  can throw at `getDirectory()`). At boot the layer runs a real OPFS
  write round-trip and only commits to OPFS when it succeeds (Issue
  #130).
- **IndexedDB** as the fallback when OPFS is unusable; the bytes are
  stored as a `Uint8Array` under a fixed key. Safari / WebKit reach this
  path and it works there.

`src/main.js` wires it in:

- **Restore before the first request.** At boot, before php-wasm serves
  anything, the persisted bytes are loaded and written to the SQLite
  path in the virtual filesystem. The boot shim's seed is gated on that
  file's existence (`db/boot.php`), so a returning visitor's database is
  found and the seed is skipped — the persisted content is what renders.
  A first visit finds nothing persisted and the boot shim seeds afresh.
- **Save after every change.** After each request the database file is
  read back and compared with the last saved snapshot; when it changed
  (a new post, an edit, a new category) the new bytes are persisted. A
  front-page view or an asset request leaves the database untouched and
  triggers no storage write.
- **Reset.** The toolbar's *Reset* button (and `window.__071now.reset()`)
  is a full environment reset (Issue #144). In one action it clears
  *every* piece of the playground's persistent and cached state — the
  persisted SQLite database and uploaded-media stores and the in-VFS
  database file, the service worker registration and every Cache API
  cache it or php-wasm populated, and the `sessionStorage` /
  `localStorage` the playground sets — then reloads. The post-reload boot
  re-registers the service worker, re-boots php-wasm, the boot shim
  re-seeds a fresh database and the virtual filesystem starts empty: the
  playground comes back exactly as a brand-new first visit.

`src/` is untouched: the persistence layer, the boot-time restore and
the reset all live under `tools/playground/`.

## Image upload

WordPress 0.71's classic admin has an upload page
(`wp-admin/b2upload.php`) that writes uploaded images to
`$fileupload_realpath` — `wp-content/uploads/`. Step 5 (Issue #124)
makes it work in the playground and persists the uploaded images.

- **The upload reaches php-wasm.** `b2upload.php`'s form is a
  `multipart/form-data` POST. The service worker already forwards
  non-GET requests; the multipart body is buffered as a `Uint8Array`
  and forwarded with its `content-type` header (boundary included)
  intact, so php-wasm's SAPI parses it into `$_POST` / `$_FILES` and
  `move_uploaded_file()` writes the image into the VFS — no change to
  `sw.js` is needed.
- **Uploads write inside the VFS.** `b2config.php` hard-codes
  `$fileupload_realpath` at the Docker document root
  (`/var/www/html/wp-content/uploads`), a path absent from the
  in-browser VFS. `src/main.js` rewrites it, in the in-VFS copy of
  `b2config.php` only, to `wp-content/uploads` under the document root,
  and the boot shim (`db/boot.php`) creates that directory so
  `b2upload.php`'s `realpath()` check and `move_uploaded_file()`
  succeed. `$fileupload_url` is derived from `$siteurl`, already
  rewritten to the scoped path, so an uploaded image's URL is a scoped
  same-origin path the service worker intercepts and the php-wasm
  static-file handler serves from the VFS.
- **Uploaded images persist.** `src/media-persistence.js` is the media
  counterpart of `src/persistence.js`: it stores the whole
  `wp-content/uploads/` tree as a path → bytes map, in OPFS (a
  dedicated sub-directory) or IndexedDB (one keyed map). `src/main.js`
  restores it into the VFS before the first request and saves it back
  after any request that changed the tree, exactly as it does for the
  database. The reset control clears this store alongside the database.

`src/` is never touched — the `b2config.php` rewrite, the uploads
directory creation, the media persistence layer and the reset all live
under `tools/playground/`.

## The block editor

WordPress 0.71-gold also carries a **custom block editor**
(`src/block-editor/`) — a `@wordpress/block-editor` React app over a thin
WordPress 0.71 JSON backend (`api/load.php`, `api/save.php`,
`api/upload.php`, served by `api/editor.php`). Issue #132 makes it work
in the playground too.

- **The playground build builds it.** The block editor's React app
  (`tools/block-editor/`) is its own package — its own `package.json`
  and `package-lock.json`, deliberately not a repo-root workspace — and
  `npm run build` there writes the bundle and the Vite manifest to
  `src/block-editor/assets/`, a git-ignored build artifact.
  `scripts/build-overlay.mjs` runs that `npm install` + `npm run build`
  **before** it snapshots `src/`, so the overlay always carries a fresh
  bundle at `wp/block-editor/assets/`. `src/block-editor/api/editor.php`
  then finds the bundle and serves the editor instead of its "bundle not
  built" fallback. The earlier empty `block-library.css` placeholder is
  gone — the real built stylesheet is now in place.
- **The build inputs stay out of the overlay.** The block editor's
  build inputs — the React source, its ~450 MB `node_modules` and the
  Vite config — live in `tools/block-editor/`, outside `src/`, so the
  snapshot of `src/` naturally excludes them; only the build *output*,
  `src/block-editor/assets/`, belongs in the overlay.
- **The Vite manifest is moved off the dot-directory.** Vite writes its
  manifest to `block-editor/assets/.vite/manifest.json`, but
  `src/wp-files.js` bundles the `wp/` tree with an `import.meta.glob`,
  and that glob does not match files inside a dot-directory. The overlay
  builder copies the manifest to `block-editor/assets/vite-manifest.json`
  and rewrites the overlay's `editor.php` to read it there — the same
  overlay-only patching as the `mysqli_*` rewrite.
- **The `api/` runs against the SQLite-backed `wpdb`.** The block
  editor's JSON endpoints bootstrap WordPress 0.71's database layer,
  which in the playground is the SQLite-backed `wpdb`. They issue only
  the query shapes the classic admin already exercises — `SELECT *`,
  `SELECT ... WHERE ID = N`, the post `INSERT` / `UPDATE`, `COUNT(*)` —
  so the existing translator covers them with no extension needed. The
  cookie auth (`be_require_login`) reads the same `wordpressuser` /
  `wordpresspass` cookies the boot shim already injects for the
  playground's auto-login, so the editor opens authenticated.

The editor is opened from the admin's per-post **Block editor** link
(`wp-admin/b2edit.showposts.php`): a post can be edited and saved through
it, and the change is reflected on the WordPress 0.71 front page. `src/`
is never touched — the block-editor build wiring, the overlay snapshot
filter and the manifest rewrite all live under `tools/playground/` (and
the block editor's own git-ignored build output).

## The polished playground

Step 6 (Issue #126) turns the working build into a presentable
browser-based WordPress 0.71.

- **Seed content.** `db/seed.php` builds a small demo blog rather than a
  single placeholder post: an admin user, three categories and several
  published posts spread across them, each with a distinct `post_date`
  so the front page lists them newest-first under date headings. A
  fresh playground therefore opens on a real WordPress 0.71 blog —
  showing 0.71's post, category and author rendering — and the reset
  control returns to exactly this state. The newest post keeps the title
  and body the e2e suite expects, so the seed stays in step with the
  playground e2e specs (`tests/playground/`, Issue #141).
- **Loading UI.** php-wasm's boot fetches and starts the ~40 MB PHP 8.3
  WebAssembly runtime, which takes a few seconds. `index.html` shows a
  loading splash — a spinner and a short explanation — over the blank
  blog iframe meanwhile; `src/main.js` mirrors the boot phase into it
  and fades it out once the iframe has actually rendered the front page,
  so the splash is replaced by the live blog rather than by a blank
  frame.
- **Playground chrome.** `index.html` carries a slim title bar above the
  blog stating plainly what this is — WordPress 0.71 (2003), running
  entirely in the browser via WebAssembly PHP — with a link back to the
  GitHub repository, alongside the existing boot-status line and the
  reset control.

These changes live entirely in `index.html`, `src/main.js` and
`db/seed.php` under `tools/playground/`; `src/` is untouched.

## In-app browsers

The playground boots php-wasm, which needs cross-origin isolation /
`SharedArrayBuffer` and a reliably controlling service worker. Mobile
**in-app browsers** — the WebViews embedded in native apps such as
X/Twitter, Facebook, Instagram and LINE — often lack or only unreliably
support those, so the playground would fail to boot or misbehave there.
Rather than show a broken playground, it detects the in-app browser up
front and directs the visitor to a standard browser, as the official
WordPress Playground does (Issue #140).

- **Detection.** `src/inapp-browser.js` is a small, side-effect-free
  module: `detectInAppBrowser(navigator)` reads only the user-agent
  string, so it is unit-testable with a stub. It first matches the
  user-agent against a list of known app markers (Facebook's `FBAN` /
  `FBAV`, `Instagram`, `Line/`, `Twitter`, WeChat's `MicroMessenger`,
  and others), then falls back to generic mobile-WebView heuristics — an
  iOS `Mobile` user-agent with no `Safari/` token (a WKWebView), or an
  Android user-agent carrying the `; wv` WebView marker. It only fires
  on mobile, so a desktop embedded browser is left alone.
- **The notice.** When an in-app browser is detected, `src/main.js`
  shows `index.html`'s `#inapp-notice` screen instead of booting
  php-wasm: it explains a standard browser is needed, shows the page URL
  with a "Copy address" button, and gives the "open in browser" steps
  for Safari / Chrome. A "Continue anyway" escape hatch reloads with a
  query flag that skips the notice, in case of a false positive.
- **Standard browsers** are unaffected — `detectInAppBrowser` returns
  "not detected" and the playground boots exactly as before.

These changes live entirely in `index.html`, `src/main.js` and the new
`src/inapp-browser.js` under `tools/playground/`; `src/` (the WordPress
0.71 source tree) is untouched.

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
    inapp-browser.js      detects mobile in-app browsers (WebViews)
    persistence.js        persists the SQLite database (OPFS / IndexedDB)
    media-persistence.js  persists the uploaded-media tree (OPFS / IndexedDB)
    wp-files.js           build-time bundle of the overlaid WP 0.71 tree
  db/                     the 071-now database layer (overlaid into WP)
    wp-db.php             SQLite-backed reimplementation of 0.71's wpdb
    sql-translator.php    MySQL -> SQLite translation layer
    seed.php              builds the schema, inserts one seeded post
    boot.php              auto_prepend boot shim (seed, auto-login, chdir)
    mysqli-compat.php     mysqli compat helpers for the rewritten sites
  scripts/
    build-overlay.mjs     builds the block-editor app, snapshots src/,
                          applies the db overlay, and rewrites the
                          direct mysqli_* call sites
  wp/                     generated overlay (git-ignored)
```

The playground's end-to-end tests live outside this workspace, in the
project's Playwright suite at `tests/playground/` (Issue #141) — see
[Testing](#testing) below.

## Running it

`071-now` is a one-command launcher, in the spirit of `wp-now` (`npx
@wp-now/wp-now start`). From anywhere in the repository:

```
npx 071-now
```

`tools/playground` is an npm workspace, so after `npm install` at the
repository root the `071-now` bin is linked into `node_modules/.bin/` and
`npx 071-now` works from any directory in the repo — exactly like `npx
071` and `npx 071-env`. It builds the 071-now overlay, starts the
playground's Vite server, opens the default browser at the playground
URL and prints that URL. A `start` subcommand and `--help` are accepted
as aliases, and `--port <port>` overrides the default port. The launcher
is `bin/071-now.mjs`.

Building the overlay (the block-editor build) needs **Node ≥ 22.12**.

## Commands

```
npx 071-now        build the overlay, start Vite and open the browser
npm run build      build the overlay and the Vite bundle
npm run dev        Vite dev server
npm run preview    serve the production build
npm run verify     run the playground e2e suite (alias of the command below)
```

## Testing

The playground has a proper end-to-end test suite in the project's
Playwright framework (`@playwright/test`, Issue #141). The specs live at
`tests/playground/` — outside this workspace, alongside the Docker-site
e2e suite — and are run as their own Playwright projects
(`playground-chromium` and `playground-webkit`):

```
npm run test:e2e:playground    run the playground e2e suite (from the repo root)
```

`npm run verify` in this workspace is an alias of that command, kept so
the historical name still works.

The suite needs no Docker: Playwright's `webServer` builds the
playground and serves the production build with `vite preview`, and the
specs run against that — the same bundle the GitHub Pages deploy ships.
It runs against two engines — Chromium and WebKit (Safari's engine) —
so a browser-compatibility regression is caught here rather than in
production (Issue #130). In WebKit the playground boots with persistence
on the IndexedDB fallback; in Chromium it uses OPFS.

The spec files cover the playground's end-to-end flows:

- `boot.spec.js` — php-wasm boots, the loading splash covers the boot
  and is replaced by the blog, the host page frames the playground and
  links to the repository, the page is cross-origin-isolated and
  service-worker-controlled, the front page renders with its CSS and the
  seeded demo blog, and a visitor can click through to a post page and a
  category page (every page asserted free of SQL and console errors).
- `admin.spec.js` — the WordPress 0.71 admin opens already logged in
  (auto-login), a post is created and edited through the admin's own
  forms, a category is added, and each change shows on the front page.
- `block-editor.spec.js` — the block editor opens from the admin's
  "Block editor" link, loads (not the "bundle not built" page), and a
  title edit saved through it round-trips to the database and the front
  page.
- `persistence.spec.js` — a post created through the admin survives a
  full page reload (the SQLite database is restored from OPFS /
  IndexedDB), and the reset control is a full environment reset
  (Issue #144): planted Cache API and Web Storage state is asserted
  cleared and the playground returns to its fresh first-visit seeded
  state.
- `image-upload.spec.js` — an image uploaded through `b2upload.php` is
  stored and served from the VFS, survives a reload, and is cleared by
  a reset.
- `inapp-browser.spec.js` — opened in a mobile in-app browser
  user-agent, the playground shows the "open in your standard browser"
  screen instead of booting, and the "continue anyway" escape hatch
  boots it (Issue #140).

The Playwright configuration is shared with the Docker-site e2e suite
(`playwright.config.js` at the repo root); see `tests/playground/` for
the specs and their shared helpers.

## Deployment

The playground is deployed to GitHub Pages at
<https://mt8.github.io/wordpress-0.71-gold/> by
`.github/workflows/playground-pages.yml` (Issue #128). The workflow runs
on a push to `main` and on manual dispatch: it builds this workspace and
publishes its `dist/` with `actions/configure-pages`,
`actions/upload-pages-artifact` and `actions/deploy-pages`.

A project page is served under the repository name, so the workflow
builds with `PLAYGROUND_BASE=/wordpress-0.71-gold/`. `vite.config.js`
reads that environment variable as the public base path (`base`), and
`src/main.js` builds the service-worker registration and the scoped
blog paths under it. Locally `build` / `dev` / `preview` and the e2e
suite leave `PLAYGROUND_BASE` unset and use the default `/`.

GitHub Pages cannot set custom HTTP headers, and php-wasm needs the
COOP/COEP cross-origin isolation headers for `SharedArrayBuffer`; the
service worker adds them itself, as described under
[Cross-origin isolation](#cross-origin-isolation).
