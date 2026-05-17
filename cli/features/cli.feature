# EN: Functional coverage of the 071-cli entry point itself: top-level usage /
#     help, the unknown-command-group error, an unknown --format value, and the
#     per-group help verb. The per-group verb and field error cases live in the
#     individual command-group feature files.
# JA: 071-cli エントリポイント自体の機能カバレッジ: トップレベルの使い方 /
#     ヘルプ、未知のコマンドグループのエラー、未知の --format 値、グループ
#     ごとの help 動詞。グループごとの動詞・フィールドのエラーケースは個別の
#     コマンドグループ feature ファイルにある。
Feature: The 071-cli entry point
  In order to discover and correctly invoke 071-cli
  As a 071-cli user
  I want usage help and clear errors for malformed commands

  Scenario: Running 071 with no arguments shows usage
    When I run `071`
    Then the return code should be 0
    And STDOUT should contain "wp-cli-style CLI for WordPress 0.71"
    And STDOUT should contain "Usage: 071 <group> <verb>"

  Scenario: The help command shows usage
    When I run `071 help`
    Then the return code should be 0
    And STDOUT should contain "Groups and verbs:"

  Scenario: An unknown command group fails and shows usage
    When I run `071 widget list`
    Then the return code should be 1
    And STDERR should contain "unknown command group 'widget'."

  Scenario: An unknown --format value fails
    When I run `071 post list --format=xml`
    Then the return code should be 1
    And STDERR should contain "unknown --format 'xml'"

  Scenario: The post group help verb lists its verbs
    When I run `071 post help`
    Then the return code should be 0
    And STDOUT should contain "071 post list | get <id> | create | update <id> | delete <id>"

  Scenario: The db group help verb lists its verbs
    When I run `071 db help`
    Then the return code should be 0
    And STDOUT should contain "071 db query <sql> | tables"
