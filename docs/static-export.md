# Static Export / 静的書き出し

EN: A way to **publish** a WordPress 0.71-gold blog safely. WordPress 0.71 is
2003-era code and must never be exposed to the public internet as a running
PHP application. Instead:

1. Write and manage posts in the **local** environment (`docker compose up`).
2. Export the whole site to **static HTML** with `bin/static-export.php`.
3. Upload only the static files to a public server.

The public server runs **no PHP and no database**, so the 2003 codebase is
never exposed — the published site has essentially no attack surface.

JA: WordPress 0.71-gold のブログを安全に**公開**するための仕組み。
WordPress 0.71 は 2003 年当時のコードであり、稼働中の PHP アプリケーション
として公開インターネットに晒してはならない。代わりに:

1. **ローカル**環境(`docker compose up`)で投稿を書き・管理する。
2. `bin/static-export.php` でサイト全体を**静的 HTML** に書き出す。
3. 静的ファイルだけを公開サーバーへアップロードする。

公開サーバーは **PHP も DB も動かさない**ため、2003 年のコードベースが晒され
ることはなく、公開サイトの攻撃面は実質ゼロになる。

## Usage / 使い方

```sh
docker compose up -d            # the local blog must be running / ローカルブログを起動
composer static-export          # or: php bin/static-export.php
```

EN: The export is written to `static-export/` (git-ignored). Environment
variables `EXPORT_BLOG_URL` (default `http://localhost:8080`) and
`EXPORT_OUT_DIR` (default `./static-export`) override the defaults.

JA: 書き出しは `static-export/`(git 管理外)に生成される。環境変数
`EXPORT_BLOG_URL`(既定 `http://localhost:8080`)と `EXPORT_OUT_DIR`
(既定 `./static-export`)で既定値を上書きできる。

## What it does / 動作

EN: `bin/static-export.php` crawls the running local blog and:

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

JA: `bin/static-export.php` は稼働中のローカルブログをクロールし:

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

### Output layout / 出力構成

| Source / 元 | Static file / 静的ファイル |
|---|---|
| `/` (home) | `index.html` |
| `index.php?p=N` | `p-N.html` |
| `index.php?cat=N` | `cat-N.html` |
| `index.php?m=YYYYMM` | `m-YYYYMM.html` |
| `b2rss.php` / `b2rss2.php` / `b2rdf.php` | `rss.xml` / `rss2.xml` / `rdf.xml` |
| CSS / images | copied under their own path / 同じパスでコピー |

## Deployment / 公開

EN: Upload the contents of `static-export/` to any static file host (object
storage, a CDN, GitHub Pages, a plain web server, …). Nothing else is needed.

JA: `static-export/` の中身を任意の静的ファイルホスト(オブジェクトストレージ、
CDN、GitHub Pages、素の Web サーバー など)へアップロードするだけでよい。

## Notes / 注意

EN:
- The dynamic blog is only ever run locally; the public server is static-only.
- Admin / login pages (`b2login.php`, `b2register.php`, `wp-admin/`) are
  deliberately not exported. Theme links pointing at them become dead links
  on the static site — harmless, but a custom theme can omit them.
- The exported feeds have their internal links relativised; they are a static
  archive snapshot rather than a live feed.

JA:
- 動的なブログはローカルでのみ稼働させ、公開サーバーは静的配信のみ。
- 管理画面・ログインページ(`b2login.php`・`b2register.php`・`wp-admin/`)は
  意図的に書き出さない。それらを指すテーマのリンクは静的サイト上でデッド
  リンクになる(無害だが、独自テーマで除くこともできる)。
- 書き出したフィードは内部リンクが相対化されており、ライブのフィードでは
  なく静的なアーカイブのスナップショットである。
