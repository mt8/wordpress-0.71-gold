# Functional coverage of the `071 db` command group: query / tables /
#     export / import. A SELECT is rendered as a result set, a non-SELECT
#     reports its affected-row count, and a SQL error is surfaced as a CLI
#     failure (plain text, not HTML). `export` writes a SQL dump and
#     `import` runs one back in -- covered here as a round-trip. Covers
#     --format variants and the db-specific error cases.
Feature: The db command group
  In order to run raw SQL against WordPress 0.71's database
  As a 071-cli user
  I want to query the database, list its tables, and export / import it

  Scenario: List the database tables
    When I run `071 db tables`
    Then the return code should be 0
    And STDOUT should contain "b2posts"
    And STDOUT should contain "b2users"
    And STDOUT should contain "b2settings"

  Scenario: List the database tables as ids
    When I run `071 db tables --format=ids`
    Then the return code should be 0
    And STDOUT should contain "b2posts"

  Scenario: Run a SELECT query
    When I run `071 db query "SELECT cat_name FROM b2categories ORDER BY cat_ID"`
    Then the return code should be 0
    And STDOUT should contain "General"
    And STDOUT should contain "News"

  Scenario: Run a SELECT query as JSON
    When I run `071 db query "SELECT cat_name FROM b2categories" --format=json`
    Then the return code should be 0
    And STDOUT should be a JSON array of 2 items

  Scenario: Run a SELECT query as a count
    When I run `071 db query "SELECT ID FROM b2posts" --format=count`
    Then the return code should be 0
    And STDOUT should be "2"

  Scenario: Run a SELECT that matches nothing
    When I run `071 db query "SELECT ID FROM b2posts WHERE ID = 9999" --format=count`
    Then the return code should be 0
    And STDOUT should be "0"

  Scenario: Run a non-SELECT statement
    When I run `071 db query "UPDATE b2posts SET post_status = 'draft' WHERE ID = 1"`
    Then the return code should be 0
    And STDOUT should contain "query OK"
    And STDOUT should contain "row(s) affected"

  Scenario: A SQL error surfaces as a CLI failure in plain text
    When I run `071 db query "SELECT * FROM no_such_table"`
    Then the return code should be 1
    And STDERR should contain "SQL error"
    And STDERR should not contain "<"

  Scenario: Query without a SQL statement
    When I run `071 db query`
    Then the return code should be 1
    And STDERR should contain "missing required argument: SQL statement."

  Scenario: An unknown db verb fails
    When I run `071 db migrate`
    Then the return code should be 1
    And STDERR should contain "unknown verb 'db migrate'."

  Scenario: Export the database, then import it back
    When I run `071 db export /tmp/071-cli-db-export-test.sql`
    Then the return code should be 0
    And STDOUT should contain "exported the database"
    When I run `071 db query "DELETE FROM b2posts"`
    Then the return code should be 0
    When I run `071 db query "SELECT ID FROM b2posts" --format=count`
    Then STDOUT should be "0"
    When I run `071 db import /tmp/071-cli-db-export-test.sql`
    Then the return code should be 0
    And STDOUT should contain "imported"
    When I run `071 db query "SELECT ID FROM b2posts" --format=count`
    Then STDOUT should be "2"

  Scenario: Export without a file path
    When I run `071 db export`
    Then the return code should be 1
    And STDERR should contain "missing required argument: output file path."

  Scenario: Import without a file path
    When I run `071 db import`
    Then the return code should be 1
    And STDERR should contain "missing required argument: input file path."

  Scenario: Import a file that does not exist
    When I run `071 db import /tmp/071-cli-no-such-dump.sql`
    Then the return code should be 1
    And STDERR should contain "no such file"
