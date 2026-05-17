# Functional coverage of the `071 export` command group: run / help. The
#     `export` command crawls a running WordPress 0.71 blog over HTTP and
#     writes a self-contained static HTML site; unlike the other groups it does
#     not touch the database. A full export run needs a running blog and is not
#     reproducible inside this database-only Behat harness, so this feature
#     covers the deterministic surface -- help text, the unknown-verb error,
#     and the unreachable-blog failure (a `--blog-url` pointed at a dead port).
#     The full export run is verified manually against the running Docker
#     environment; see docs/static-export.md.
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
