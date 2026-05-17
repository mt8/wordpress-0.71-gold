# EN: Functional coverage of the `071 category` command group: list / get /
#     create / delete (0.71 has no category update verb), --format variants,
#     and the category-specific error cases.
# JA: `071 category` コマンドグループの機能カバレッジ: list / get / create /
#     delete(0.71 にカテゴリーの update 動詞は無い)、--format バリアント、
#     カテゴリー固有のエラーケース。
Feature: The category command group
  In order to manage WordPress 0.71 post categories
  As a 071-cli user
  I want to list, read, create and delete categories

  Scenario: List categories as a table
    When I run `071 category list`
    Then the return code should be 0
    And STDOUT should contain "General"
    And STDOUT should contain "News"

  Scenario: List categories as JSON
    When I run `071 category list --format=json`
    Then the return code should be 0
    And STDOUT should be a JSON array of 2 items

  Scenario: List categories as a count
    When I run `071 category list --format=count`
    Then the return code should be 0
    And STDOUT should be "2"

  Scenario: List categories as ids
    When I run `071 category list --format=ids`
    Then the return code should be 0
    And STDOUT should be "1 2"

  Scenario: List categories as CSV
    When I run `071 category list --format=csv`
    Then the return code should be 0
    And STDOUT should contain "cat_ID,cat_name"

  Scenario: Get a single category
    When I run `071 category get 2`
    Then the return code should be 0
    And STDOUT should contain "News"

  Scenario: Create a category
    When I run `071 category create --cat_name=Reviews`
    Then the return code should be 0
    And STDOUT should contain "Success: created category"
    When I run `071 category list`
    Then STDOUT should contain "Reviews"

  Scenario: Delete a category
    When I run `071 category delete 2`
    Then the return code should be 0
    And STDOUT should contain "Success: deleted category 2."
    When I run `071 category list --format=count`
    Then STDOUT should be "1"

  Scenario: Get a category that does not exist
    When I run `071 category get 9999`
    Then the return code should be 1
    And STDERR should contain "category 9999 not found."

  Scenario: Get a category with an invalid id
    When I run `071 category get nope`
    Then the return code should be 1
    And STDERR should contain "invalid id 'nope'"

  Scenario: Create a category without the required name
    When I run `071 category create`
    Then the return code should be 1
    And STDERR should contain "missing required field --cat_name."

  Scenario: Create a category with an unknown field
    When I run `071 category create --cat_name=Tech --colour=blue`
    Then the return code should be 1
    And STDERR should contain "unknown field '--colour'"

  Scenario: Delete a category that does not exist
    When I run `071 category delete 9999`
    Then the return code should be 1
    And STDERR should contain "category 9999 not found."

  Scenario: An unknown category verb fails
    When I run `071 category update 1`
    Then the return code should be 1
    And STDERR should contain "unknown verb 'category update'."
