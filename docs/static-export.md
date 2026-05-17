# Static Export

A way to **publish** a WordPress 0.71-gold blog safely. WordPress 0.71 is
2003-era code and must never be exposed to the public internet as a running
PHP application. Instead:

1. Write and manage posts in the **local** environment (`071-env start`).
2. Export the whole site to **static HTML** with `071 export`.
3. Upload only the static files to a public server.

The public server runs **no PHP and no database**, so the 2003 codebase is
never exposed — the published site has essentially no attack surface.

## Usage

The static export is the `export` command group of
[`071-cli`](../tools/cli/README.md):

```sh
npx 071-env start               # the local blog must be running
071 export                      # or: composer static-export
```

`composer static-export` is a thin alias for `071 export`. The export is
written to `static-export/` (git-ignored).

The blog base URL and output directory are resolved, in order, from the
command flags, then the environment variables, then the built-in defaults:

| Setting | Flag | Environment variable | Default |
|---|---|---|---|
| Blog base URL | `--blog-url=<url>` | `EXPORT_BLOG_URL` | `http://localhost:8080` |
| Output directory | `--out-dir=<dir>` | `EXPORT_OUT_DIR` | `./static-export` |

`071 export run` is accepted as an explicit synonym for `071 export`.

## What it does

The export is a **read-only HTTP crawl** of the running blog — it never
touches the database. It crawls the running local blog and:

- exports the home page, every post (`?p=`), every category (`?cat=`), every
  monthly archive (`?m=`), and the three feeds;
- rewrites every internal link to a self-contained static path and strips the
  blog host, so the result works from any public URL;
- copies the referenced CSS and images;
- sends a `User-Agent` header so the legacy code does not emit a missing
  `$_SERVER['HTTP_USER_AGENT']` notice into the output;
- warns (on stderr) if the blog emits any PHP notice/error — that text would
  otherwise be baked into a static file, so the blog should be fixed and the
  export re-run.

### Output layout

| Source | Static file |
|---|---|
| `/` (home) | `index.html` |
| `index.php?p=N` | `p-N.html` |
| `index.php?cat=N` | `cat-N.html` |
| `index.php?m=YYYYMM` | `m-YYYYMM.html` |
| `b2rss.php` / `b2rss2.php` / `b2rdf.php` | `rss.xml` / `rss2.xml` / `rdf.xml` |
| CSS / images | copied under their own path |

## Deployment

Upload the contents of `static-export/` to any static file host (object
storage, a CDN, GitHub Pages, a plain web server, …). Nothing else is needed.

## Notes

- The dynamic blog is only ever run locally; the public server is static-only.
- Admin / login pages (`b2login.php`, `b2register.php`, `wp-admin/`) are
  deliberately not exported. Theme links pointing at them become dead links
  on the static site — harmless, but a custom theme can omit them.
- The exported feeds have their internal links relativised; they are a static
  archive snapshot rather than a live feed.
- `071 export` exits with a non-zero status and a plain-text error if the blog
  is unreachable (start the local environment first).

## Testing

The `071 export` command is covered by the 071-cli Behat suite
(`tools/cli/features/export.feature`): the help text, the unknown-verb error,
and the unreachable-blog failure path. A full export run crawls a running
blog over HTTP, which the database-only Behat harness does not provide, so the
full run is verified manually against the running Docker environment with
`071 export`.

---

# 静的書き出し

WordPress 0.71-gold のブログを安全に**公開**するための仕組み。
WordPress 0.71 は 2003 年当時のコードであり、稼働中の PHP アプリケーション
として公開インターネットに晒してはならない。代わりに:

1. **ローカル**環境(`071-env start`)で投稿を書き・管理する。
2. `071 export` でサイト全体を**静的 HTML** に書き出す。
3. 静的ファイルだけを公開サーバーへアップロードする。

公開サーバーは **PHP も DB も動かさない**ため、2003 年のコードベースが晒され
ることはなく、公開サイトの攻撃面は実質ゼロになる。

## 使い方

静的書き出しは [`071-cli`](../tools/cli/README.md) の `export` コマンド
グループである:

```sh
npx 071-env start               # the local blog must be running
071 export                      # or: composer static-export
```

`composer static-export` は `071 export` の薄いエイリアスである。書き出しは
`static-export/`(git 管理外)に生成される。

ブログのベース URL と出力ディレクトリは、コマンドフラグ、次に環境変数、次に
組み込みの既定値の順に解決される:

| 設定 | フラグ | 環境変数 | 既定値 |
|---|---|---|---|
| ブログのベース URL | `--blog-url=<url>` | `EXPORT_BLOG_URL` | `http://localhost:8080` |
| 出力ディレクトリ | `--out-dir=<dir>` | `EXPORT_OUT_DIR` | `./static-export` |

`071 export run` は `071 export` の明示的な同義語として受け付けられる。

## 動作

書き出しは稼働中のブログに対する**読み取り専用の HTTP クロール**であり、
データベースには一切触れない。稼働中のローカルブログをクロールし:

- トップページ・全投稿(`?p=`)・全カテゴリ(`?cat=`)・全月別アーカイブ
  (`?m=`)・3 つのフィードを書き出す;
- 内部リンクをすべて自己完結した静的パスへ書き換え、ブログホストを除去する
  ため、結果はどの公開 URL からでも動作する;
- 参照される CSS と画像をコピーする;
- `User-Agent` ヘッダを送り、レガシーコードが `$_SERVER['HTTP_USER_AGENT']`
  欠落の notice を出力へ混入させないようにする;
- ブログが PHP の notice/error を出した場合は(stderr へ)警告する。その
  テキストは静的ファイルに焼き込まれてしまうため、ブログを修正して書き出しを
  やり直すべきである。

### 出力構成

| 元 | 静的ファイル |
|---|---|
| `/` (home) | `index.html` |
| `index.php?p=N` | `p-N.html` |
| `index.php?cat=N` | `cat-N.html` |
| `index.php?m=YYYYMM` | `m-YYYYMM.html` |
| `b2rss.php` / `b2rss2.php` / `b2rdf.php` | `rss.xml` / `rss2.xml` / `rdf.xml` |
| CSS / images | 同じパスでコピー |

## 公開

`static-export/` の中身を任意の静的ファイルホスト(オブジェクトストレージ、
CDN、GitHub Pages、素の Web サーバー など)へアップロードするだけでよい。

## 注意

- 動的なブログはローカルでのみ稼働させ、公開サーバーは静的配信のみ。
- 管理画面・ログインページ(`b2login.php`・`b2register.php`・`wp-admin/`)は
  意図的に書き出さない。それらを指すテーマのリンクは静的サイト上でデッド
  リンクになる(無害だが、独自テーマで除くこともできる)。
- 書き出したフィードは内部リンクが相対化されており、ライブのフィードでは
  なく静的なアーカイブのスナップショットである。
- ブログに到達できない場合、`071 export` は非ゼロの終了ステータスと
  プレーンテキストのエラーで終了する(まずローカル環境を起動すること)。

## テスト

`071 export` コマンドは 071-cli の Behat スイート
(`tools/cli/features/export.feature`)でカバーされている: ヘルプテキスト、
未知の動詞エラー、到達不能ブログの失敗経路である。完全な書き出し実行は
稼働中のブログを HTTP でクロールするが、データベース専用の Behat ハーネスは
それを提供しないため、完全な実行は稼働中の Docker 環境に対して `071 export`
で手動検証する。
