<?php
/**
 * 071-cli -- Behat FeatureContext.
 *
 * Gherkin step definitions for the 071-cli functional test suite. Modelled
 *     on wp-cli's own Behat context: a `When I run` step executes the 071 CLI
 *     as a child process and captures STDOUT, STDERR and the exit code; `Then`
 *     steps assert on the captured output. The `071` placeholder in a command
 *     string is expanded to `php tools/cli/php/071-cli.php` with the
 *     test-database connection flags appended, so every command runs against
 *     the dedicated, isolated test database -- never the developer's `b2`
 *     database.
 *
 *     Database isolation: a @BeforeScenario hook reseeds the test database from
 *     tools/cli/tests/fixtures.sql before every scenario, so each scenario
 *     starts from an identical, known state and write commands cannot leak
 *     between scenarios. The connection target defaults to 127.0.0.1:3307 /
 *     b2_test (the tools/cli/tests/docker-compose.yml stack) and is overridable
 *     via the B2_TEST_DB* environment variables.
 *
 * @package 071-cli
 */

declare(strict_types=1);

use Behat\Behat\Context\Context;
use Behat\Behat\Hook\Scope\BeforeScenarioScope;
use Behat\Gherkin\Node\PyStringNode;
use PHPUnit\Framework\Assert;

/**
 * Step definitions and hooks for the 071-cli Behat suite.
 */
final class FeatureContext implements Context
{
    /**
     * Absolute path to the repository root (parent of tools/).
     */
    private string $repoRoot;

    /**
     * STDOUT captured from the last `When I run` command.
     */
    private string $stdout = '';

    /**
     * STDERR captured from the last `When I run` command.
     */
    private string $stderr = '';

    /**
     * Exit code of the last `When I run` command.
     */
    private int $exitCode = 0;

    public function __construct()
    {
        // bootstrap/ -> features/ -> cli/ -> tools/ -> repository root.
        $this->repoRoot = dirname(__DIR__, 4);
    }

    /**
     * Reseed the test database before every scenario, giving each scenario
     *     an identical, known starting state.
     * @BeforeScenario
     */
    public function reseedDatabase(BeforeScenarioScope $scope): void
    {
        $config = $this->dbConfig();
        $mysqli = @mysqli_connect(
            $config['host'],
            $config['user'],
            $config['pass'],
            '',
            $config['port']
        );

        if (!($mysqli instanceof mysqli)) {
            throw new RuntimeException(sprintf(
                'Cannot reach the 071-cli test database at %s:%d. Start it with: '
                . 'docker compose -p 071-cli-test -f tools/cli/tests/docker-compose.yml up -d',
                $config['host'],
                $config['port']
            ));
        }

        // WordPress 0.71's wp-db.php connects with sql_mode='' so its
        //     2003-era DDL (0000-00-00 datetime defaults) is accepted; the
        //     seeder mirrors that so fixtures.sql loads under MySQL 8.
        @mysqli_query($mysqli, "SET SESSION sql_mode=''");
        @mysqli_query($mysqli, sprintf(
            'CREATE DATABASE IF NOT EXISTS `%s`',
            str_replace('`', '', $config['name'])
        ));
        @mysqli_select_db($mysqli, $config['name']);

        $sqlPath = $this->repoRoot . '/tools/cli/tests/fixtures.sql';
        $sql     = file_get_contents($sqlPath);
        if (false === $sql) {
            throw new RuntimeException("Cannot read fixture file: $sqlPath");
        }

        if (!mysqli_multi_query($mysqli, $sql)) {
            throw new RuntimeException(
                'Failed to seed the test database: ' . mysqli_error($mysqli)
            );
        }
        // Drain every result so the connection is left ready for the next
        //     statement batch.
        do {
            $result = mysqli_store_result($mysqli);
            if ($result instanceof mysqli_result) {
                mysqli_free_result($result);
            }
        } while (mysqli_more_results($mysqli) && mysqli_next_result($mysqli));

        if ('' !== mysqli_error($mysqli)) {
            throw new RuntimeException(
                'Error while seeding the test database: ' . mysqli_error($mysqli)
            );
        }

        mysqli_close($mysqli);
    }

    /**
     * Run a 071 CLI command. The command is written between backticks in
     *     the feature file (`When I run \`071 post list\``); the leading `071`
     *     token is replaced with the PHP entry point plus the test-database
     *     connection flags.
     * @When /^I run `(.+)`$/
     */
    public function iRun(string $command): void
    {
        $this->execute($command);
    }

    /**
     * Run a 071 CLI command supplied as a multi-line (PyString) block; used
     *     when a command argument contains characters awkward in a single line.
     * @When I run:
     */
    public function iRunBlock(PyStringNode $command): void
    {
        $this->execute($command->getRaw());
    }

    /**
     * Assert the last command's exit code equals the expected value.
     * @Then the return code should be :code
     */
    public function theReturnCodeShouldBe(int $code): void
    {
        Assert::assertSame(
            $code,
            $this->exitCode,
            $this->describeFailure("expected return code $code")
        );
    }

    /**
     * Assert the last command's exit code does not equal the given value.
     * @Then the return code should not be :code
     */
    public function theReturnCodeShouldNotBe(int $code): void
    {
        Assert::assertNotSame(
            $code,
            $this->exitCode,
            $this->describeFailure("expected return code other than $code")
        );
    }

    /**
     * @Then STDOUT should contain:
     */
    public function stdoutShouldContainBlock(PyStringNode $expected): void
    {
        $this->assertContains($this->stdout, $expected->getRaw(), 'STDOUT');
    }

    /**
     * @Then STDOUT should contain :text
     */
    public function stdoutShouldContain(string $text): void
    {
        $this->assertContains($this->stdout, $text, 'STDOUT');
    }

    /**
     * @Then STDOUT should not contain :text
     */
    public function stdoutShouldNotContain(string $text): void
    {
        $this->assertNotContains($this->stdout, $text, 'STDOUT');
    }

    /**
     * @Then STDOUT should be empty
     */
    public function stdoutShouldBeEmpty(): void
    {
        Assert::assertSame(
            '',
            trim($this->stdout),
            $this->describeFailure('expected empty STDOUT')
        );
    }

    /**
     * @Then STDOUT should be :text
     */
    public function stdoutShouldBe(string $text): void
    {
        Assert::assertSame(
            $text,
            trim($this->stdout),
            $this->describeFailure("expected STDOUT to be exactly '$text'")
        );
    }

    /**
     * Assert STDOUT is valid JSON containing the given number of items.
     * @Then /^STDOUT should be a JSON array of (\d+) items?$/
     */
    public function stdoutShouldBeJsonArrayOf(int $count): void
    {
        $decoded = json_decode(trim($this->stdout), true);
        Assert::assertIsArray(
            $decoded,
            $this->describeFailure('expected STDOUT to be a JSON array')
        );
        Assert::assertCount(
            $count,
            $decoded,
            $this->describeFailure("expected a JSON array of $count item(s)")
        );
    }

    /**
     * @Then STDERR should contain:
     */
    public function stderrShouldContainBlock(PyStringNode $expected): void
    {
        $this->assertContains($this->stderr, $expected->getRaw(), 'STDERR');
    }

    /**
     * @Then STDERR should contain :text
     */
    public function stderrShouldContain(string $text): void
    {
        $this->assertContains($this->stderr, $text, 'STDERR');
    }

    /**
     * @Then STDERR should not contain :text
     */
    public function stderrShouldNotContain(string $text): void
    {
        $this->assertNotContains($this->stderr, $text, 'STDERR');
    }

    /**
     * @Then STDERR should be empty
     */
    public function stderrShouldBeEmpty(): void
    {
        Assert::assertSame(
            '',
            trim($this->stderr),
            $this->describeFailure('expected empty STDERR')
        );
    }

    /**
     * Build and run the child process for a 071 CLI command line.
     */
    private function execute(string $command): void
    {
        $command = trim($command);
        if (!str_starts_with($command, '071')) {
            throw new InvalidArgumentException(
                "A run step must start with `071`; got: $command"
            );
        }

        // Strip the `071` token; what remains is the CLI argument string.
        $args   = ltrim(substr($command, 3));
        $config = $this->dbConfig();

        $full = sprintf(
            '%s %s %s %s',
            escapeshellarg(PHP_BINARY),
            escapeshellarg($this->repoRoot . '/tools/cli/php/071-cli.php'),
            $args,
            implode(' ', [
                '--path=' . escapeshellarg($this->repoRoot . '/src'),
                '--dbhost=' . escapeshellarg($config['host'] . ':' . $config['port']),
                '--dbname=' . escapeshellarg($config['name']),
                '--dbuser=' . escapeshellarg($config['user']),
                '--dbpass=' . escapeshellarg($config['pass']),
            ])
        );

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        $process = proc_open($full, $descriptors, $pipes, $this->repoRoot);
        if (!is_resource($process)) {
            throw new RuntimeException("Failed to start: $full");
        }

        fclose($pipes[0]);
        $this->stdout = (string) stream_get_contents($pipes[1]);
        $this->stderr = (string) stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        $this->exitCode = proc_close($process);
    }

    /**
     * Resolve the test-database connection settings.
     * @return array{host: string, port: int, name: string, user: string, pass: string}
     */
    private function dbConfig(): array
    {
        return [
            'host' => $this->env('B2_TEST_DB_HOST', '127.0.0.1'),
            'port' => (int) $this->env('B2_TEST_DB_PORT', '3307'),
            'name' => $this->env('B2_TEST_DB_NAME', 'b2_test'),
            'user' => $this->env('B2_TEST_DB_USER', 'root'),
            'pass' => $this->env('B2_TEST_DB_PASSWORD', 'rootpass'),
        ];
    }

    /**
     * Read an environment variable, falling back to a default.
     */
    private function env(string $name, string $default): string
    {
        $value = getenv($name);

        return (false !== $value && '' !== $value) ? $value : $default;
    }

    /**
     * Assert that a captured stream contains the expected substring.
     */
    private function assertContains(string $haystack, string $needle, string $stream): void
    {
        Assert::assertStringContainsString(
            trim($needle),
            $haystack,
            $this->describeFailure("expected $stream to contain '" . trim($needle) . "'")
        );
    }

    /**
     * Assert that a captured stream does not contain the given substring.
     */
    private function assertNotContains(string $haystack, string $needle, string $stream): void
    {
        Assert::assertStringNotContainsString(
            trim($needle),
            $haystack,
            $this->describeFailure("expected $stream not to contain '" . trim($needle) . "'")
        );
    }

    /**
     * Build a failure message that includes the captured streams, so a
     *     failed assertion is diagnosable from the Behat output alone.
     */
    private function describeFailure(string $summary): string
    {
        return sprintf(
            "%s.\n--- exit code: %d\n--- STDOUT ---\n%s\n--- STDERR ---\n%s",
            $summary,
            $this->exitCode,
            $this->stdout,
            $this->stderr
        );
    }
}
