# EN: Functional coverage of the `071 option` command group: list / get /
#     set. 0.71 stores its settings as the columns of a single b2settings row
#     (ID = 1), so each column is one "option" name. Covers --format variants
#     for `list` and the option-specific error cases.
# JA: `071 option` コマンドグループの機能カバレッジ: list / get / set。
#     0.71 は設定を単一の b2settings 行(ID = 1)のカラムとして保持するため、
#     各カラムが 1 つの「オプション」名となる。`list` の --format バリアントと
#     オプション固有のエラーケースをカバーする。
Feature: The option command group
  In order to manage WordPress 0.71 blog settings
  As a 071-cli user
  I want to list, read and set options

  Scenario: List options as a table
    When I run `071 option list`
    Then the return code should be 0
    And STDOUT should contain "posts_per_page"
    And STDOUT should contain "date_format"

  Scenario: List options as JSON
    When I run `071 option list --format=json`
    Then the return code should be 0
    And STDOUT should contain "option_name"

  Scenario: List options as a count
    When I run `071 option list --format=count`
    Then the return code should be 0
    And STDOUT should be "8"

  Scenario: List options as CSV
    When I run `071 option list --format=csv`
    Then the return code should be 0
    And STDOUT should contain "option_name,option_value"

  Scenario: Get an option value
    When I run `071 option get posts_per_page`
    Then the return code should be 0
    And STDOUT should be "7"

  Scenario: Set an option value
    When I run `071 option set posts_per_page 15`
    Then the return code should be 0
    And STDOUT should contain "Success: updated option 'posts_per_page'."
    When I run `071 option get posts_per_page`
    Then STDOUT should be "15"

  Scenario: Get an unknown option
    When I run `071 option get no_such_option`
    Then the return code should be 1
    And STDERR should contain "unknown option 'no_such_option'."

  Scenario: Set an unknown option
    When I run `071 option set no_such_option 1`
    Then the return code should be 1
    And STDERR should contain "unknown option 'no_such_option'."

  Scenario: Set without a value
    When I run `071 option set posts_per_page`
    Then the return code should be 1
    And STDERR should contain "missing required argument: option value."

  Scenario: Get without an option name
    When I run `071 option get`
    Then the return code should be 1
    And STDERR should contain "missing required argument: option name."

  Scenario: The ID column cannot be set
    When I run `071 option set ID 9`
    Then the return code should be 1
    And STDERR should contain "the ID column is the settings-row primary key"

  Scenario: An unknown option verb fails
    When I run `071 option destroy`
    Then the return code should be 1
    And STDERR should contain "unknown verb 'option destroy'."
