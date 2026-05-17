# EN: Functional coverage of the `071 export` command group: run / help. The
#     `export` command crawls a running WordPress 0.71 blog over HTTP and
#     writes a self-contained static HTML site; unlike the other groups it does
#     not touch the database. A full export run needs a running blog and is not
#     reproducible inside this database-only Behat harness, so this feature
#     covers the deterministic surface -- help text, the unknown-verb error,
#     and the unreachable-blog failure (a `--blog-url` pointed at a dead port).
#     The full export run is verified manually against the running Docker
#     environment; see docs/static-export.md.
# JA: `071 export` コマンドグループの機能カバレッジ: run / help。`export`
#     コマンドは稼働中の WordPress 0.71 ブログを HTTP でクロールし、自己完結
#     した静的 HTML サイトを書き出す。他のグループと異なりデータベースには
#     触れない。完全な書き出し実行は稼働中のブログを必要とし、本データベース
#     専用の Behat ハーネス内では再現できないため、本 feature は決定的な
#     表面 -- ヘルプテキスト、未知の動詞エラー、到達不能ブログの失敗
#     (`--blog-url` を死んだポートへ向ける) -- をカバーする。完全な書き出し
#     実行は稼働中の Docker 環境に対して手動で検証する。docs/static-export.md
#     を参照。
Feature: The export command group
  In order to publish WordPress 0.71 as a safe static site
  As a 071-cli user
  I want to export the running blog to static HTML

  Scenario: The export group help verb describes the command
    When I run `071 export help`
    Then the return code should be 0
    And STDOUT should contain "071 export [run]"
    And STDOUT should contain "static-export/"
    And STDOUT should contain "--blog-url"
    And STDOUT should contain "--out-dir"

  Scenario: An unknown export verb fails
    When I run `071 export migrate`
    Then the return code should be 1
    And STDERR should contain "unknown verb 'export migrate'."

  Scenario: Exporting an unreachable blog fails with a plain-text error
    When I run `071 export --blog-url=http://127.0.0.1:59999`
    Then the return code should be 1
    And STDOUT should contain "Static export"
    And STDERR should contain "cannot reach the blog"
    And STDERR should not contain "<"

  Scenario: The export verb run is accepted and fails the same way when unreachable
    When I run `071 export run --blog-url=http://127.0.0.1:59999`
    Then the return code should be 1
    And STDERR should contain "cannot reach the blog"
