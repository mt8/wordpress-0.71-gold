# EN: Functional coverage of the `071 user` command group: list / get /
#     create / update / delete, --format variants, --fields, and the
#     user-specific error cases (missing --user_login, duplicate login).
# JA: `071 user` コマンドグループの機能カバレッジ: list / get / create /
#     update / delete、--format バリアント、--fields、ユーザー固有の
#     エラーケース(--user_login の欠如、ログイン重複)。
Feature: The user command group
  In order to manage WordPress 0.71 users
  As a 071-cli user
  I want to list, read, create, update and delete users

  Scenario: List users as a table
    When I run `071 user list`
    Then the return code should be 0
    And STDOUT should contain "admin"
    And STDOUT should contain "editor"

  Scenario: List users as JSON
    When I run `071 user list --format=json`
    Then the return code should be 0
    And STDOUT should be a JSON array of 2 items

  Scenario: List users as a count
    When I run `071 user list --format=count`
    Then the return code should be 0
    And STDOUT should be "2"

  Scenario: List users as ids
    When I run `071 user list --format=ids`
    Then the return code should be 0
    And STDOUT should be "1 2"

  Scenario: List users as CSV with chosen fields
    When I run `071 user list --format=csv --fields=ID,user_login`
    Then the return code should be 0
    And STDOUT should contain "ID,user_login"
    And STDOUT should contain "1,admin"

  Scenario: Get a single user
    When I run `071 user get 2`
    Then the return code should be 0
    And STDOUT should contain "editor"

  Scenario: Get a user restricted to chosen fields
    When I run `071 user get 1 --fields=user_login,user_level`
    Then the return code should be 0
    And STDOUT should contain "user_login"
    And STDOUT should not contain "user_email"

  Scenario: Create a user
    When I run `071 user create --user_login=author --user_email=author@example.com`
    Then the return code should be 0
    And STDOUT should contain "Success: created user"
    When I run `071 user list`
    Then STDOUT should contain "author"

  Scenario: Update a user
    When I run `071 user update 2 --user_nickname=ChiefEditor`
    Then the return code should be 0
    And STDOUT should contain "Success: updated user 2."
    When I run `071 user get 2 --fields=user_nickname`
    Then STDOUT should contain "ChiefEditor"

  Scenario: Delete a user
    When I run `071 user delete 2`
    Then the return code should be 0
    And STDOUT should contain "Success: deleted user 2."
    When I run `071 user list --format=count`
    Then STDOUT should be "1"

  Scenario: Get a user that does not exist
    When I run `071 user get 9999`
    Then the return code should be 1
    And STDERR should contain "user 9999 not found."

  Scenario: Get a user with an invalid id
    When I run `071 user get xyz`
    Then the return code should be 1
    And STDERR should contain "invalid id 'xyz'"

  Scenario: Create a user without the required login
    When I run `071 user create --user_email=nobody@example.com`
    Then the return code should be 1
    And STDERR should contain "missing required field --user_login."

  Scenario: Create a user whose login already exists
    When I run `071 user create --user_login=admin`
    Then the return code should be 1
    And STDERR should contain "already exists"

  Scenario: Update a user that does not exist
    When I run `071 user update 9999 --user_nickname=Ghost`
    Then the return code should be 1
    And STDERR should contain "user 9999 not found."

  Scenario: Delete a user that does not exist
    When I run `071 user delete 9999`
    Then the return code should be 1
    And STDERR should contain "user 9999 not found."

  Scenario: An unknown user verb fails
    When I run `071 user explode`
    Then the return code should be 1
    And STDERR should contain "unknown verb 'user explode'."
