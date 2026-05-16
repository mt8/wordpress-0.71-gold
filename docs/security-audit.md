# Security Audit

A whole-codebase security review of WordPress 0.71-gold. Every item below
is a **pre-existing vulnerability in WordPress 0.71 itself** (2003-era b2/
cafelog code), not something introduced by the PHP 8.3 migration. Each
category is tracked as a GitHub Issue and fixed in its own pull request.

## Summary

| # | Category | Severity | Issue |
|---|---|---|---|
| 1 | SQL injection | High | #31 |
| 2 | Cross-site scripting (XSS) | High | #32 |
| 3 | Cross-site request forgery (CSRF) | High | #33 |
| 4 | Authentication & session | Critical | #34 |
| 5 | Access control | Medium | #35 |
| 6 | File upload | High (※) | #36 |
| 7 | Information disclosure & misc | Medium | #37 |

(※) The file-upload code is vulnerable but `$use_fileupload` is `0` by
default, so it is not currently reachable.

**Update (Issue #44).** The XML-RPC server, the comment feature, trackback
and pingback were removed entirely (see `docs/php83-migration.md`). This
deletes whole classes of attack surface rather than patching it: the
comment-related parts of #35 (the `editcomment` / `deletecomment` handlers in
`b2edit.php`) and of #37 (the commenter-controlled mail `From:` header in
`b2comments.post.php`, and the XML-RPC `X-Mailer` exposure) no longer exist,
and the unauthenticated XML-RPC endpoint (`xmlrpc.php`) is gone. The remaining
items below describe the code as it was before that removal.

## Details

### 1. SQL injection (#31)

All queries are built by string interpolation; no prepared statements.
`addslashes()` (magic_quotes emulation) is the only defence and does not
protect numeric/unquoted contexts -- `WHERE ID = $post` with `$post` from
`$_GET` is directly injectable.
Key sites: `b2edit.php`, `b2categories.php`, `b2team.php`, `b2profile.php`,
`linkmanager.php`, `b2functions.php`.

### 2. Cross-site scripting (#32)

User-controlled data is echoed into HTML without escaping (reflected:
`HTTP_REFERER`, `PHP_SELF`, `$_POST` values; stored: post/comment content).
Escaping is applied inconsistently across files.

### 3. Cross-site request forgery (#33)

No CSRF tokens anywhere. State-changing actions (delete post, delete
user, delete comment) are reachable via GET, so an `<img>` tag is enough to
trigger them against a logged-in admin.

### 4. Authentication & session (#34)

Passwords are stored in plaintext; the lost-password feature emails the
plaintext password; the auth cookie is `md5(password)` valid for a year;
cookies carry no `HttpOnly` / `Secure` / `SameSite` flags.

### 5. Access control (#35)

Authorization is enforced inconsistently. `b2team.php`'s user-admin
action handlers do only a relative level check with no minimum-level gate;
the UI hides the links separately. Object ids come from GET with partial
ownership checks (IDOR).

### 6. File upload (#36)

`b2upload.php` builds the save path from the user-supplied filename
(path traversal), validates type with a loose `preg_match`, and expects a
`chmod 777` directory -- potential remote code execution. Disabled by default.

### 7. Information disclosure & misc (#37) -- RESOLVED

Mail header injection (commenter-controlled `From:` header, no CRLF
filtering); SQL errors and full SQL printed to the page; WordPress version
disclosed in a `generator` meta tag and `X-Mailer` header; `register_globals`
-style `$$var` assignment from `$_GET`/`$_POST`.

**Resolved (Issue #37).** The mail-header-injection and `X-Mailer` items
were already eliminated by the Issue #44 removal (comment / trackback /
XML-RPC). The remaining items are now fixed: SQL errors are logged
server-side and replaced in the page with a generic message; the WordPress
version is no longer printed in the `generator` meta tag or the RSS/RDF feed
generator strings; and the `$$var` assignment loops were rewritten to the
explicit `$GLOBALS[$b2var]` form. See `docs/php83-migration.md` (Issue #37)
for details.

## Remediation approach

The seven categories share many source files (`b2edit.php` alone appears
in #31, #33 and #35), so they are fixed **sequentially** -- one category, one
Issue, one pull request, each branched from an up-to-date `main`. Each fix is
verified to keep the blog front end, the admin screens, `php -l`, phpcs and
PHPStan clean before merge.

---

# セキュリティ監査

WordPress 0.71-gold の全体セキュリティレビュー。以下の項目はいずれも
**WordPress 0.71 本体に元から存在する脆弱性**(2003年当時の b2/cafelog
コード)であり、PHP 8.3 移行で持ち込んだものではない。各カテゴリは GitHub
Issue で追跡し、個別のプルリクエストで修正する。

## 一覧

| # | 分類 | 深刻度 | Issue |
|---|---|---|---|
| 1 | SQL インジェクション | High | #31 |
| 2 | クロスサイトスクリプティング (XSS) | High | #32 |
| 3 | CSRF | High | #33 |
| 4 | 認証・セッション管理 | Critical | #34 |
| 5 | アクセス制御・認可 | Medium | #35 |
| 6 | ファイルアップロード | High (※) | #36 |
| 7 | 情報漏洩・その他 | Medium | #37 |

(※) ファイルアップロードのコードは脆弱だが、既定で `$use_fileupload`
が `0` のため現状は到達しない。

**更新(Issue #44)。** XML-RPC サーバ・コメント機能・トラックバック・
ピンバックを完全に撤去した(`docs/php83-migration.md` 参照)。これはパッチ
ではなく攻撃面そのものの削除である: #35 のコメント関連部分(`b2edit.php` の
`editcomment` / `deletecomment` ハンドラ)と #37 のコメント関連部分
(`b2comments.post.php` のコメント投稿者制御の `From:` ヘッダ、XML-RPC の
`X-Mailer` 露出)は最早存在せず、未認証の XML-RPC エンドポイント
(`xmlrpc.php`)も無くなった。以下の各項目は撤去前のコードを記述している。

## 詳細

### 1. SQL injection (#31)

全クエリが文字列連結で組まれ、プリペアドステートメントは無い。唯一の
防御 `addslashes()`(magic_quotes 模倣)は数値・クォート無しコンテキストを
保護せず、`WHERE ID = $post`(`$post` は `$_GET` 由来)が直接注入可能。

### 2. Cross-site scripting (#32)

ユーザー制御データが未エスケープで HTML 出力される(反射型:
`HTTP_REFERER`・`PHP_SELF`・`$_POST` 値、蓄積型: 投稿/コメント本文)。
エスケープはファイル間で不統一。

### 3. Cross-site request forgery (#33)

CSRF トークンが皆無。状態変更操作(投稿削除・ユーザー削除・コメント
削除)が GET で実行でき、`<img>` タグだけでログイン中の管理者に対し発火する。

### 4. Authentication & session (#34)

パスワードは平文保存。パスワード忘れ機能は平文をメール送信。認証
クッキーは `md5(password)` で 1 年有効。クッキーに `HttpOnly` /
`Secure` / `SameSite` フラグが無い。

### 5. Access control (#35)

認可の適用が不統一。`b2team.php` のユーザー管理ハンドラは相対レベル
比較のみで最低レベルゲートが無く、UI はリンクを別判定で隠すだけ。
オブジェクト ID は GET 由来で所有者チェックも部分的(IDOR)。

### 6. File upload (#36)

`b2upload.php` は保存パスをユーザー指定ファイル名から組み立て(パス
トラバーサル)、緩い `preg_match` で型判定し、`chmod 777` ディレクトリを
前提とする -- リモートコード実行の余地。既定では無効。

### 7. Information disclosure & misc (#37) -- 解決済み

メールヘッダインジェクション(コメント投稿者制御の `From:` ヘッダ、
CRLF フィルタ無し)、SQL エラーと SQL 全文の画面出力、`generator` meta
タグ・`X-Mailer` ヘッダでの WordPress バージョン露出、`register_globals`
風の `$$var` 代入。

**解決済み(Issue #37)。** メールヘッダインジェクションと `X-Mailer` の
項目は、Issue #44 の撤去(コメント・トラックバック・XML-RPC)で既に
解消済み。残る項目を修正した: SQL エラーはサーバ側でログに記録し、ページ
には汎用メッセージを表示する。WordPress バージョンは `generator` meta タグや
RSS/RDF フィードの generator 文字列に出力しない。`$$var` 代入ループは明示的な
`$GLOBALS[$b2var]` 形に書き換えた。詳細は `docs/php83-migration.md`
(Issue #37)を参照。

## 修正方針

7 カテゴリは多くのソースファイルを共有する(`b2edit.php` だけで #31・
#33・#35 に登場)ため、**順次**修正する -- 1 カテゴリ＝1 Issue＝1 プル
リクエスト、毎回最新の `main` から分岐。各修正はマージ前に、ブログ本体・
管理画面・`php -l`・phpcs・PHPStan がクリーンなままであることを確認する。
