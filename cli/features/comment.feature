# EN: Functional coverage of the `071 comment` command group: list / get /
#     delete (0.71's comment group has no create or update verb), --format
#     variants, and the comment-specific error cases.
# JA: `071 comment` コマンドグループの機能カバレッジ: list / get / delete
#     (0.71 の comment グループに create や update 動詞は無い)、--format
#     バリアント、コメント固有のエラーケース。
Feature: The comment command group
  In order to manage WordPress 0.71 comments
  As a 071-cli user
  I want to list, read and delete comments

  Scenario: List comments as a table
    When I run `071 comment list`
    Then the return code should be 0
    And STDOUT should contain "A Visitor"

  Scenario: List comments as JSON
    When I run `071 comment list --format=json`
    Then the return code should be 0
    And STDOUT should be a JSON array of 1 item

  Scenario: List comments as a count
    When I run `071 comment list --format=count`
    Then the return code should be 0
    And STDOUT should be "1"

  Scenario: List comments as ids
    When I run `071 comment list --format=ids`
    Then the return code should be 0
    And STDOUT should be "1"

  Scenario: List comments as CSV with chosen fields
    When I run `071 comment list --format=csv --fields=comment_ID,comment_author`
    Then the return code should be 0
    And STDOUT should contain "comment_ID,comment_author"

  Scenario: Get a single comment
    When I run `071 comment get 1`
    Then the return code should be 0
    And STDOUT should contain "Nice first post!"

  Scenario: Get a comment restricted to chosen fields
    When I run `071 comment get 1 --fields=comment_ID,comment_author`
    Then the return code should be 0
    And STDOUT should contain "comment_author"
    And STDOUT should not contain "comment_content"

  Scenario: Delete a comment
    When I run `071 comment delete 1`
    Then the return code should be 0
    And STDOUT should contain "Success: deleted comment 1."
    When I run `071 comment list --format=count`
    Then STDOUT should be "0"

  Scenario: Get a comment that does not exist
    When I run `071 comment get 9999`
    Then the return code should be 1
    And STDERR should contain "comment 9999 not found."

  Scenario: Get a comment with an invalid id
    When I run `071 comment get bad`
    Then the return code should be 1
    And STDERR should contain "invalid id 'bad'"

  Scenario: Delete a comment that does not exist
    When I run `071 comment delete 9999`
    Then the return code should be 1
    And STDERR should contain "comment 9999 not found."

  Scenario: An unknown comment verb fails
    When I run `071 comment create`
    Then the return code should be 1
    And STDERR should contain "unknown verb 'comment create'."
