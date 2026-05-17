<?php
/**
 * 071-cli -- Behat FeatureContext.
 *
 * EN: Gherkin step definitions for the 071-cli functional test suite. Modelled
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
 * JA: 071-cli 機能テストスイートの Gherkin ステップ定義。wp-cli 自身の Behat
 *     コンテキストに倣う: `When I run` ステップは 071 CLI を子プロセスとして
 *     実行し STDOUT・STDERR・終了コードを捕捉する。`Then` ステップは捕捉した
 *     出力に対してアサートする。コマンド文字列中のプレースホルダ `071` は
 *     `php tools/cli/php/071-cli.php` に展開され、テストデータベース接続
 *     フラグが付加される。そのためすべてのコマンドは専用の分離されたテスト
 *     データベースに対して実行され、開発者の `b2` データベースには決して
 *     触れない。
 *
 *     データベース分離: @BeforeScenario フックが各シナリオの前に
 *     tools/cli/tests/fixtures.sql からテストデータベースを再投入する。その
 *     ため各シナリオは同一の既知の状態から開始し、書き込みコマンドが
 *     シナリオ間で漏れることはない。接続先は既定で 127.0.0.1:3307 / b2_test
 *     (tools/cli/tests/docker-compose.yml のスタック) であり、B2_TEST_DB*
 *     環境変数で上書きできる。
 *
 * @package 071-cli
 */

declare(strict_types=1);

use Behat\Behat\Context\Context;
use Behat\Behat\Hook\Scope\BeforeScenarioScope;
use Behat\Gherkin\Node\PyStringNode;
use PHPUnit\Framework\Assert;

/**
 * EN: Step definitions and hooks for the 071-cli Behat suite.
 * JA: 071-cli Behat スイートのステップ定義とフック。
 */
final class FeatureContext implements Context
{
    /**
     * EN: Absolute path to the repository root (parent of tools/).
     * JA: リポジトリルート (tools/ の親) への絶対パス。
     */
    private string $repoRoot;

    /**
     * EN: STDOUT captured from the last `When I run` command.
     * JA: 直近の `When I run` コマンドから捕捉した STDOUT。
     */
    private string $stdout = '';

    /**
     * EN: STDERR captured from the last `When I run` command.
     * JA: 直近の `When I run` コマンドから捕捉した STDERR。
     */
    private string $stderr = '';

    /**
     * EN: Exit code of the last `When I run` command.
     * JA: 直近の `When I run` コマンドの終了コード。
     */
    private int $exitCode = 0;

    public function __construct()
    {
        // EN: bootstrap/ -> features/ -> cli/ -> tools/ -> repository root.
        // JA: bootstrap/ -> features/ -> cli/ -> tools/ -> リポジトリルート。
        $this->repoRoot = dirname(__DIR__, 4);
    }

    /**
     * EN: Reseed the test database before every scenario, giving each scenario
     *     an identical, known starting state.
     * JA: 各シナリオの前にテストデータベースを再投入し、各シナリオへ同一の
     *     既知の開始状態を与える。
     *
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

        // EN: WordPress 0.71's wp-db.php connects with sql_mode='' so its
        //     2003-era DDL (0000-00-00 datetime defaults) is accepted; the
        //     seeder mirrors that so fixtures.sql loads under MySQL 8.
        // JA: WordPress 0.71 の wp-db.php は sql_mode='' で接続し、2003 年当時の
        //     DDL (0000-00-00 の datetime 既定値) を受け付ける。シーダーも
        //     それに倣い、fixtures.sql が MySQL 8 で読み込めるようにする。
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
        // EN: Drain every result so the connection is left ready for the next
        //     statement batch.
        // JA: 全結果を読み切り、接続を次の文バッチに備えた状態にする。
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
     * EN: Run a 071 CLI command. The command is written between backticks in
     *     the feature file (`When I run \`071 post list\``); the leading `071`
     *     token is replaced with the PHP entry point plus the test-database
     *     connection flags.
     * JA: 071 CLI コマンドを実行する。コマンドは feature ファイル内でバック
     *     クォートで囲んで書く(`When I run \`071 post list\``)。先頭の `071`
     *     トークンは PHP エントリポイントとテストデータベース接続フラグに
     *     置き換えられる。
     *
     * @When /^I run `(.+)`$/
     */
    public function iRun(string $command): void
    {
        $this->execute($command);
    }

    /**
     * EN: Run a 071 CLI command supplied as a multi-line (PyString) block; used
     *     when a command argument contains characters awkward in a single line.
     * JA: 複数行 (PyString) ブロックで与えられた 071 CLI コマンドを実行する。
     *     コマンド引数に単一行で扱いにくい文字が含まれる場合に使う。
     *
     * @When I run:
     */
    public function iRunBlock(PyStringNode $command): void
    {
        $this->execute($command->getRaw());
    }

    /**
     * EN: Assert the last command's exit code equals the expected value.
     * JA: 直近のコマンドの終了コードが期待値と等しいことをアサートする。
     *
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
     * EN: Assert the last command's exit code does not equal the given value.
     * JA: 直近のコマンドの終了コードが指定値と等しくないことをアサートする。
     *
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
     * EN: Assert STDOUT is valid JSON containing the given number of items.
     * JA: STDOUT が指定件数の要素を持つ妥当な JSON であることをアサートする。
     *
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
     * EN: Build and run the child process for a 071 CLI command line.
     * JA: 071 CLI コマンドラインの子プロセスを組み立てて実行する。
     */
    private function execute(string $command): void
    {
        $command = trim($command);
        if (!str_starts_with($command, '071')) {
            throw new InvalidArgumentException(
                "A run step must start with `071`; got: $command"
            );
        }

        // EN: Strip the `071` token; what remains is the CLI argument string.
        // JA: `071` トークンを取り除く。残りが CLI の引数文字列となる。
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
     * EN: Resolve the test-database connection settings.
     * JA: テストデータベースの接続設定を解決する。
     *
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
     * EN: Read an environment variable, falling back to a default.
     * JA: 環境変数を読み、無ければ既定値にフォールバックする。
     */
    private function env(string $name, string $default): string
    {
        $value = getenv($name);

        return (false !== $value && '' !== $value) ? $value : $default;
    }

    /**
     * EN: Assert that a captured stream contains the expected substring.
     * JA: 捕捉したストリームが期待する部分文字列を含むことをアサートする。
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
     * EN: Assert that a captured stream does not contain the given substring.
     * JA: 捕捉したストリームが指定の部分文字列を含まないことをアサートする。
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
     * EN: Build a failure message that includes the captured streams, so a
     *     failed assertion is diagnosable from the Behat output alone.
     * JA: 捕捉したストリームを含む失敗メッセージを組み立て、失敗したアサート
     *     を Behat の出力だけで診断できるようにする。
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
