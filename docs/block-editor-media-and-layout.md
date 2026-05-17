# Block Editor: Image Upload & Layout-Block Consistency

An investigation (Issue #80, under the Issue #78 umbrella) of two design
questions that must be answered before the `src/block-editor/` block editor
can handle real content. **Investigation only -- no implementation here.** Each
section ends with a recommendation; the actual work would be follow-up Issues.

---

## 1. Image upload

### 1.1 The situation

- WordPress 0.71 **already has a working, hardened upload backend**:
  `wp-admin/b2upload.php`. It is a classic b2/cafelog popup: a multipart form
  POSTs a file, `move_uploaded_file()` stores it under `$fileupload_realpath`,
  and the page hands back `<img src="$fileupload_url/NAME">` markup to paste.
- It is configured in `b2config.php`: `$use_fileupload` (0 = disabled by
  default), `$fileupload_realpath` (filesystem directory), `$fileupload_url`
  (public URL prefix), `$fileupload_allowedtypes` (` jpg gif png `),
  `$fileupload_maxk` (size limit).
- `b2upload.php` was **hardened by the security audit** (Issues #31-#37):
  `basename()` + character allow-list on the file name, exact per-extension
  allow-list match, and a `realpath()` destination-directory check
  (path-traversal defence).
- There is **no REST API** (0.71 predates it; the Gutenberg investigation,
  `docs/gutenberg-investigation.md`, confirms this). So Gutenberg's standard
  `wp/v2/media` upload path -- and `@wordpress/media-utils`' `uploadMedia()`,
  which targets it -- cannot be used as-is.

### 1.2 How @wordpress/block-editor handles uploads

`@wordpress/block-editor` does not hard-code the REST API. The Image (and
Gallery, Cover, ...) blocks call a **`mediaUpload` function supplied through
the editor settings** passed to `BlockEditorProvider`. Its shape is roughly:

```js
mediaUpload( { filesList, allowedTypes, additionalData, onFileChange, onError } )
```

It uploads each file however it likes and calls `onFileChange` with media
objects (`{ id, url, alt, ... }`). If no `mediaUpload` is provided, the blocks
fall back to "Insert from URL". **This is the integration seam:** a custom
`mediaUpload` can POST to any endpoint we choose.

### 1.3 Options

| Option | Summary | Trade-off |
|---|---|---|
| **A. JSON `upload.php`** | Add `src/block-editor/api/upload.php` -- a thin JSON endpoint beside `load.php` / `save.php` -- and wire a custom `mediaUpload` to it. | Most work, best UX: a real upload button in the editor. Needs careful security. |
| **B. Insert-by-URL only** | Provide no `mediaUpload`; users paste image URLs (e.g. of files uploaded separately via `b2upload.php`). | Zero new backend; no upload UX in the editor. |
| **C. Reuse `b2upload.php`** | Open `b2upload.php` in a popup from the editor. | Reuses audited code, but its popup writes into a classic `<textarea>`, not the block tree -- a poor fit for a block editor. |

### 1.4 Recommendation: Option A

Add `src/block-editor/api/upload.php` -- a JSON sibling of `load.php` /
`save.php`. Key points:

- **Reuse the existing trust + config.** Go through `bootstrap.php`
  (`be_require_login()` cookie auth), and reuse `b2config.php`'s
  `$fileupload_*` settings rather than inventing new ones.
- **Reuse `b2upload.php`'s audited hardening verbatim:** `basename()` + the
  `[^A-Za-z0-9._-]` character allow-list, repeated-dot collapse, the exact
  final-extension allow-list match, and the `realpath()` destination check.
  This code already passed the security audit -- do not re-derive it.
- **Put the upload directory under `src/`** (e.g. `src/images/`), so: (a) the
  Docker blog serves the files, and (b) `bin/static-export.php` -- which
  copies every referenced `gif/png/jpg/...` asset -- picks them up at export
  time with no extra work. Set `$fileupload_realpath` to the container path of
  that directory and `$fileupload_url` to `<siteurl>/images`. The directory
  should be git-ignored (uploaded media is user content, not source).
- **Response:** `{ id, url, alt }` so the custom `mediaUpload` can satisfy the
  Image block. `id` can be a synthetic value (0.71 has no media table).
- The editor's `mediaUpload` posts each file (multipart) to `upload.php` and
  resolves `onFileChange` with the returned objects.
- `$use_fileupload` defaults to 0; the block editor's upload path can either
  honour it or use its own guard -- decide when implementing.

This keeps one hardened upload code path, needs no REST API, and -- because
the files land under `src/` -- stays compatible with the static-export
publishing model. The classic `b2upload.php` can remain for the classic
editor.

---

## 2. Layout blocks: editor vs front-end consistency

### 2.1 The situation

- The 0.71 front end (`src/index.php`) loads only **`layout2b.css`**
  (`@import`) and **`print.css`**. `layout2b.css` is a 2003 blog-layout
  stylesheet; it has **no block CSS** (`.wp-block-columns`, `.wp-block-group`,
  `.wp-block-cover`, ...).
- The block editor (`tools/block-editor/`) bundles the
  `@wordpress/block-library` **and** `@wordpress/block-editor` stylesheets into
  its build (see `tools/block-editor/src/main.jsx`), so layout blocks look
  correct **in the editor**.
- Block content is stored as block-markup HTML in `b2posts.post_content` and
  rendered by `the_content()` inside `<div class="storycontent">`.
- Result: a Columns / Group / Cover block is saved as e.g.
  `<div class="wp-block-columns">...`. The editor styles it; the front end --
  having no rule for `.wp-block-columns` -- renders it as **unstyled stacked
  divs**. Editor preview and front end **disagree**. "Layout-free" blocks
  (paragraph, heading, list, quote) render as plain semantic HTML and look the
  same either way -- they are not affected.

### 2.2 Options

| Option | Summary | Trade-off |
|---|---|---|
| **A. Ship block-library CSS to the front end** | Emit `@wordpress/block-library`'s front-end `style.css` as a static file and `<link>` it from `index.php`'s `<head>`. Optionally also load `layout2b.css` into the editor canvas. | Full consistency, all blocks usable. Adds a sizable stylesheet to every page; minor risk of clashes with the 2003 `layout2b.css`. |
| **B. Restrict to layout-free blocks** | Register only paragraph / heading / list / quote / image / separator etc. -- blocks that render identically with or without block CSS. | Zero front-end change; editor ≈ front end by construction. No columns / group / cover. |
| **C. Static-export-time injection** | Inject the block CSS only into the exported static site. | The exported site is consistent; the **local Docker front end still is not**, so the editor preview cannot be trusted while authoring. |
| **D. Trimmed CSS** | Ship hand-picked block CSS for only the layout blocks actually enabled. | Smaller payload than A; ongoing maintenance to keep the subset in sync. |

### 2.3 Recommendation: Option A (phased)

1. **Now -- accept Option B as the current state.** The editor already
   registers core blocks and is documented as "static blocks"; treating the
   *layout* blocks as out of scope for the moment means the editor preview is
   already trustworthy for the blocks in use.
2. **To add layout blocks -- Option A.** Make the `@wordpress/block-library`
   front-end `style.css` a static file the blog serves (the Vite build can
   emit it alongside the editor bundle, or a build step copies it from
   `node_modules`), and add one `<link>` to `index.php`'s `<head>`. Because
   `bin/static-export.php` copies every referenced CSS asset, the exported
   site inherits it automatically -- **no static-export change needed**.
3. **For editor-side fidelity**, load `layout2b.css` into the
   `@wordpress/block-editor` canvas (it accepts editor `styles`). Then the
   editor canvas and the front end share both stylesheets and agree
   two-directionally.

Option C is rejected as the primary approach: it leaves the local Docker
front end inconsistent, so an author cannot trust the preview. Option A keeps
the local preview and the published site identical, which is the property that
matters for a tool people actually write in.

---

## 3. Summary

| Question | Recommendation |
|---|---|
| Image upload | **Option A** -- a JSON `src/block-editor/api/upload.php`, reusing `b2config.php`'s `$fileupload_*` config and `b2upload.php`'s audited hardening; files under `src/` so Docker serves them and static-export captures them; wired to the editor via a custom `mediaUpload`. |
| Layout-block consistency | **Option A, phased** -- accept layout-free blocks now; to enable layout blocks, ship `@wordpress/block-library`'s front-end `style.css` from `index.php` and load `layout2b.css` into the editor canvas. static-export needs no change. |

Both are investigation outcomes only. Implementation would be follow-up
Issues under #78.

---

# ブロックエディタ: 画像アップロードとレイアウト整合性

`src/block-editor/` のブロックエディタが実コンテンツを扱えるようにする前に
答えるべき 2 つの設計課題の調査(Issue #80、Issue #78 アンブレラ配下)。
**本書は調査のみ -- 実装は行わない。** 各節の末尾に推奨を示す。実際の作業は
後続 Issue とする。

---

## 1. 画像アップロード

### 1.1 現状

- WordPress 0.71 には**既に動作する堅牢なアップロードバックエンドがある**:
  `wp-admin/b2upload.php`。古典的な b2/cafelog のポップアップで、multipart
  フォームがファイルを POST し、`move_uploaded_file()` が `$fileupload_realpath`
  配下へ保存し、ページが貼り付け用の `<img src="$fileupload_url/NAME">` を返す。
- 設定は `b2config.php`: `$use_fileupload`(既定 0 = 無効)、
  `$fileupload_realpath`(保存ディレクトリ)、`$fileupload_url`(公開 URL
  接頭辞)、`$fileupload_allowedtypes`(` jpg gif png `)、`$fileupload_maxk`
  (サイズ上限)。
- `b2upload.php` は**セキュリティ監査(Issue #31-#37)で堅牢化済み**:
  ファイル名の `basename()` ＋文字許可リスト、拡張子単位の厳密な許可リスト
  一致、`realpath()` による保存先ディレクトリ確認(パストラバーサル対策)。
- **REST API は無い**(0.71 はそれ以前。Gutenberg 調査
  `docs/gutenberg-investigation.md` で確認済み)。よって Gutenberg 標準の
  `wp/v2/media` アップロード経路 -- およびそれを叩く `@wordpress/media-utils`
  の `uploadMedia()` -- はそのままでは使えない。

### 1.2 アップロードの仕組み

`@wordpress/block-editor` は REST API を前提にしていない。画像(ギャラリー・
カバー等)ブロックは、`BlockEditorProvider` に渡すエディタ設定経由で供給される
**`mediaUpload` 関数**を呼ぶ。形はおおよそ:

```js
mediaUpload( { filesList, allowedTypes, additionalData, onFileChange, onError } )
```

各ファイルを任意の方法でアップロードし、メディアオブジェクト
(`{ id, url, alt, ... }`)で `onFileChange` を呼ぶ。`mediaUpload` を渡さない
場合、ブロックは「URL から挿入」にフォールバックする。**ここが統合点である:**
独自の `mediaUpload` は任意のエンドポイントへ POST できる。

### 1.3 選択肢

| 選択肢 | 概要 | トレードオフ |
|---|---|---|
| **A. JSON `upload.php`** | `src/block-editor/api/upload.php`(`load.php` / `save.php` と並ぶ薄い JSON エンドポイント)を追加し、独自の `mediaUpload` を接続する。 | 作業量は最大、UX は最良: エディタに本物のアップロードボタン。セキュリティ要注意。 |
| **B. URL 挿入のみ** | `mediaUpload` を渡さず、利用者は画像 URL を貼り付ける(別途 `b2upload.php` 等でアップロード済みのもの)。 | 新規バックエンドゼロ。エディタにアップロード UX なし。 |
| **C. `b2upload.php` 流用** | エディタからポップアップで `b2upload.php` を開く。 | 監査済みコードを流用できるが、ポップアップは古典的な `<textarea>` に書き込むためブロックツリーに合わない。 |

### 1.4 推奨: Option A

`src/block-editor/api/upload.php` -- `load.php` / `save.php` と並ぶ JSON
エンドポイント -- を追加する。要点:

- **既存の信頼境界と設定を再利用する。** `bootstrap.php`
  (`be_require_login()` のクッキー認証)を通し、新設せず `b2config.php` の
  `$fileupload_*` 設定を再利用する。
- **`b2upload.php` の監査済み堅牢化をそのまま再利用する:** `basename()` ＋
  `[^A-Za-z0-9._-]` 文字許可リスト、連続ドットの圧縮、最終拡張子の厳密な
  許可リスト一致、`realpath()` による保存先確認。このコードは既に
  セキュリティ監査を通過している -- 再考案しない。
- **アップロードディレクトリを `src/` 配下に置く**(例 `src/images/`)。
  こうすると (a) Docker のブログがファイルを配信し、(b) 参照された
  `gif/png/jpg/...` アセットをすべてコピーする `bin/static-export.php` が、
  書き出し時に追加作業なしで取り込む。`$fileupload_realpath` をその
  ディレクトリのコンテナパスに、`$fileupload_url` を `<siteurl>/images` に
  設定する。ディレクトリは git 管理外にする(アップロード済みメディアは
  ソースではなく利用者コンテンツ)。
- **応答:** `{ id, url, alt }`。独自の `mediaUpload` が画像ブロックを満たせる
  ようにする。`id` は合成値でよい(0.71 にメディアテーブルは無い)。
- エディタの `mediaUpload` は各ファイルを(multipart で)`upload.php` へ POST
  し、返ったオブジェクトで `onFileChange` を解決する。
- `$use_fileupload` は既定 0。ブロックエディタのアップロード経路はそれに従う
  か独自ガードを持つか -- 実装時に決める。

これにより堅牢なアップロードコード経路を 1 つに保ち、REST API を必要とせず、
ファイルが `src/` 配下に置かれるため静的書き出しの公開モデルとも整合する。
古典的な `b2upload.php` は古典エディタ用に残せる。

---

## 2. レイアウト系ブロックの整合性

### 2.1 現状

- 0.71 のフロントエンド(`src/index.php`)は **`layout2b.css`**(`@import`)と
  **`print.css`** のみ読み込む。`layout2b.css` は 2003 年のブログレイアウト
  スタイルシートで、**ブロック CSS は無い**(`.wp-block-columns`・
  `.wp-block-group`・`.wp-block-cover` 等)。
- ブロックエディタ(`tools/block-editor/`)は `@wordpress/block-library`
  **と** `@wordpress/block-editor` のスタイルシートをビルドにバンドルする
  (`tools/block-editor/src/main.jsx` 参照)。よってレイアウト系ブロックは
  **エディタ内では**正しく見える。
- ブロック内容はブロックマークアップ HTML として `b2posts.post_content` に
  保存され、`the_content()` が `<div class="storycontent">` 内で描画する。
- 結果: カラム / グループ / カバーブロックは例えば
  `<div class="wp-block-columns">...` として保存される。エディタはこれを
  整形するが、フロントエンドは `.wp-block-columns` の規則を持たないため
  **無装飾の縦積み div** として描画する。エディタプレビューとフロントエンドが
  **食い違う**。「レイアウト不要」ブロック(段落・見出し・リスト・引用)は
  素の意味づけ HTML として描画され、どちらでも同じに見える -- 影響を受けない。

### 2.2 選択肢

| 選択肢 | 概要 | トレードオフ |
|---|---|---|
| **A. ブロック CSS をフロントへ配信** | `@wordpress/block-library` のフロント用 `style.css` を静的ファイルとして出力し、`index.php` の `<head>` から `<link>` する。任意でエディタキャンバスにも `layout2b.css` を読み込む。 | 完全な整合、全ブロック利用可。各ページに相応のスタイルシートが増える。2003 年の `layout2b.css` との軽微な衝突リスク。 |
| **B. レイアウト不要ブロックに限定** | 段落 / 見出し / リスト / 引用 / 画像 / 区切り等、ブロック CSS の有無で見え方が変わらないブロックのみ登録する。 | フロント変更ゼロ。構成上エディタ ≈ フロント。カラム / グループ / カバーは不可。 |
| **C. 静的書き出し時に注入** | ブロック CSS を書き出した静的サイトにのみ注入する。 | 書き出したサイトは整合するが、**ローカル Docker のフロントは整合しない**。執筆中のエディタプレビューが信頼できない。 |
| **D. 絞り込み CSS** | 実際に有効化するレイアウトブロックの分だけブロック CSS を厳選して配信する。 | A より軽量。サブセットを同期し続ける保守が必要。 |

### 2.3 推奨: Option A(段階的に)

1. **現時点 -- 選択肢 B を現状として受け入れる。** エディタは既にコアブロックを
   登録し「静的ブロック」と文書化されている。当面 *レイアウト* 系ブロックを
   スコープ外とすれば、使用中のブロックについてはエディタプレビューは既に
   信頼できる。
2. **レイアウトブロックを足すなら -- 選択肢 A。** `@wordpress/block-library`
   のフロント用 `style.css` をブログが配信する静的ファイルにし(Vite ビルドが
   エディタバンドルと並べて出力する、またはビルド手順で `node_modules` から
   コピーする)、`index.php` の `<head>` に `<link>` を 1 つ加える。
   `bin/static-export.php` は参照された CSS アセットをすべてコピーするため、
   書き出したサイトは自動的にこれを引き継ぐ -- **静的書き出しの変更は不要**。
3. **エディタ側の忠実度のため**、`@wordpress/block-editor` のキャンバスに
   `layout2b.css` を読み込む(エディタは `styles` を受け付ける)。これで
   エディタキャンバスとフロントエンドが両方のスタイルシートを共有し、双方向に
   一致する。

選択肢 C は主たる方針としては却下する: ローカル Docker のフロントエンドが
不整合のままで、執筆者がプレビューを信頼できない。選択肢 A はローカル
プレビューと公開サイトを同一に保つ。実際に執筆に使う道具では、この性質こそが
重要である。

---

## 3. まとめ

| 課題 | 推奨 |
|---|---|
| 画像アップロード | **選択肢 A** -- JSON の `src/block-editor/api/upload.php`。`b2config.php` の `$fileupload_*` 設定と `b2upload.php` の監査済み堅牢化を再利用。ファイルは `src/` 配下に置き Docker が配信・静的書き出しが取り込む。独自 `mediaUpload` でエディタに接続。 |
| レイアウト整合性 | **選択肢 A・段階的** -- 当面はレイアウト不要ブロックを受け入れる。レイアウトブロックを有効化する際は `@wordpress/block-library` のフロント用 `style.css` を `index.php` から配信し、`layout2b.css` をエディタキャンバスに読み込む。静的書き出しの変更は不要。 |

いずれも調査結果のみ。実装は #78 配下の後続 Issue とする。
