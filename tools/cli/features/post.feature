# Functional coverage of the `071 post` command group: list / get /
#     create / update / delete, every --format variant, --fields, and the
#     post-specific error cases. Every scenario runs against the freshly
#     reseeded test database (see FeatureContext).
Feature: The post command group
  In order to manage WordPress 0.71 posts
  As a 071-cli user
  I want to list, read, create, update and delete posts

  Scenario: List posts as a table
    When I run `071 post list`
    Then the return code should be 0
    And STDOUT should contain "Hello world!"
    And STDOUT should contain "Second Post"
    And STDERR should be empty

  Scenario: List posts as JSON
    When I run `071 post list --format=json`
    Then the return code should be 0
    And STDOUT should be a JSON array of 2 items

  Scenario: List posts as CSV restricted to chosen fields
    When I run `071 post list --format=csv --fields=ID,post_title`
    Then the return code should be 0
    And STDOUT should contain "ID,post_title"
    And STDOUT should contain "1,Hello world!"

  Scenario: List posts as a count
    When I run `071 post list --format=count`
    Then the return code should be 0
    And STDOUT should be "2"

  Scenario: List posts as ids
    When I run `071 post list --format=ids`
    Then the return code should be 0
    And STDOUT should be "2 1"

  Scenario: Get a single post
    When I run `071 post get 1`
    Then the return code should be 0
    And STDOUT should contain "Hello world!"
    And STDOUT should contain "publish"

  Scenario: Get a single post as JSON
    When I run `071 post get 1 --format=json`
    Then the return code should be 0
    And STDOUT should be a JSON array of 1 item
    And STDOUT should contain "Hello world!"

  Scenario: Get a post restricted to chosen fields
    When I run `071 post get 1 --fields=ID,post_title`
    Then the return code should be 0
    And STDOUT should contain "post_title"
    And STDOUT should not contain "post_content"

  Scenario: Create a post
    When I run `071 post create --post_title=Drafted --post_content=Body --post_status=draft`
    Then the return code should be 0
    And STDOUT should contain "Success: created post"

  Scenario: A created post is then listed
    When I run `071 post create --post_title=Freshly --post_content=Body`
    Then the return code should be 0
    When I run `071 post list`
    Then STDOUT should contain "Freshly"

  Scenario: Update a post
    When I run `071 post update 2 --post_status=publish`
    Then the return code should be 0
    And STDOUT should contain "Success: updated post 2."
    When I run `071 post get 2 --fields=post_status`
    Then STDOUT should contain "publish"

  Scenario: Delete a post
    When I run `071 post delete 2`
    Then the return code should be 0
    And STDOUT should contain "Success: deleted post 2."
    When I run `071 post list --format=count`
    Then STDOUT should be "1"

  Scenario: Get a post that does not exist
    When I run `071 post get 9999`
    Then the return code should be 1
    And STDERR should contain "post 9999 not found."

  Scenario: Get a post with an invalid id
    When I run `071 post get abc`
    Then the return code should be 1
    And STDERR should contain "invalid id 'abc'"

  Scenario: Update a post that does not exist
    When I run `071 post update 9999 --post_status=draft`
    Then the return code should be 1
    And STDERR should contain "post 9999 not found."

  Scenario: Update a post with no fields to set
    When I run `071 post update 1`
    Then the return code should be 1
    And STDERR should contain "nothing to update"

  Scenario: Delete a post that does not exist
    When I run `071 post delete 9999`
    Then the return code should be 1
    And STDERR should contain "post 9999 not found."

  Scenario: Create a post with an unknown field
    When I run `071 post create --post_title=T --bogus=1`
    Then the return code should be 1
    And STDERR should contain "unknown field '--bogus'"

  Scenario: An unknown post verb fails
    When I run `071 post frobnicate`
    Then the return code should be 1
    And STDERR should contain "unknown verb 'post frobnicate'."
