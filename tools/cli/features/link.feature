# EN: Functional coverage of the `071 link` command group: list / get /
#     create / delete (0.71's link group has no update verb), --format
#     variants, --fields, and the link-specific error cases (the two required
#     fields --link_url and --link_name).
# JA: `071 link` コマンドグループの機能カバレッジ: list / get / create /
#     delete(0.71 の link グループに update 動詞は無い)、--format バリアント、
#     --fields、リンク固有のエラーケース(必須フィールド --link_url と
#     --link_name)。
Feature: The link command group
  In order to manage the WordPress 0.71 blogroll
  As a 071-cli user
  I want to list, read, create and delete links

  Scenario: List links as a table
    When I run `071 link list`
    Then the return code should be 0
    And STDOUT should contain "WordPress"
    And STDOUT should contain "http://cafelog.com"

  Scenario: List links as JSON
    When I run `071 link list --format=json`
    Then the return code should be 0
    And STDOUT should be a JSON array of 2 items

  Scenario: List links as a count
    When I run `071 link list --format=count`
    Then the return code should be 0
    And STDOUT should be "2"

  Scenario: List links as ids
    When I run `071 link list --format=ids`
    Then the return code should be 0
    And STDOUT should be "1 2"

  Scenario: List links as CSV with chosen fields
    When I run `071 link list --format=csv --fields=link_id,link_name`
    Then the return code should be 0
    And STDOUT should contain "link_id,link_name"
    And STDOUT should contain "1,WordPress"

  Scenario: Get a single link
    When I run `071 link get 1`
    Then the return code should be 0
    And STDOUT should contain "WordPress"

  Scenario: Create a link
    When I run `071 link create --link_url=http://example.com --link_name=Example`
    Then the return code should be 0
    And STDOUT should contain "Success: created link"
    When I run `071 link list`
    Then STDOUT should contain "Example"

  Scenario: Delete a link
    When I run `071 link delete 2`
    Then the return code should be 0
    And STDOUT should contain "Success: deleted link 2."
    When I run `071 link list --format=count`
    Then STDOUT should be "1"

  Scenario: Get a link that does not exist
    When I run `071 link get 9999`
    Then the return code should be 1
    And STDERR should contain "link 9999 not found."

  Scenario: Get a link with an invalid id
    When I run `071 link get oops`
    Then the return code should be 1
    And STDERR should contain "invalid id 'oops'"

  Scenario: Create a link without the required URL
    When I run `071 link create --link_name=NoUrl`
    Then the return code should be 1
    And STDERR should contain "missing required field --link_url."

  Scenario: Create a link without the required name
    When I run `071 link create --link_url=http://example.org`
    Then the return code should be 1
    And STDERR should contain "missing required field --link_name."

  Scenario: Create a link with an unknown field
    When I run `071 link create --link_url=http://example.org --link_name=X --foo=bar`
    Then the return code should be 1
    And STDERR should contain "unknown field '--foo'"

  Scenario: Delete a link that does not exist
    When I run `071 link delete 9999`
    Then the return code should be 1
    And STDERR should contain "link 9999 not found."

  Scenario: An unknown link verb fails
    When I run `071 link update 1`
    Then the return code should be 1
    And STDERR should contain "unknown verb 'link update'."
