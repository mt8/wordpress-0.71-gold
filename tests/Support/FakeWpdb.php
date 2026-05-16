<?php
/**
 * EN: A test-support fake for the WordPress 0.71 `wpdb` database layer.
 *     The legacy helpers in b2functions.php / b2template.functions.php read
 *     the global $wpdb and call get_row() / get_results() / get_var() /
 *     query() on it. Installing this stub as the $wpdb global lets those
 *     database-dependent helpers be unit-tested without a live MySQL server:
 *     the test pre-configures the return values, and the stub records every
 *     SQL string it was asked to run so the test can assert on the query.
 * JA: WordPress 0.71 の `wpdb` データ層に対するテスト補助の偽実装。
 *     b2functions.php / b2template.functions.php のレガシーヘルパーは
 *     グローバル $wpdb を読み、その get_row() / get_results() / get_var() /
 *     query() を呼ぶ。本スタブを $wpdb グローバルとして差し込めば、それら
 *     DB 依存ヘルパーを実 MySQL サーバー無しで単体テストできる: テストが
 *     戻り値を事前設定し、スタブは実行を求められた SQL 文字列をすべて記録
 *     するため、テストはクエリ内容を検証できる。
 */

declare(strict_types=1);

namespace Tests\Support;

final class FakeWpdb
{
    /**
     * EN: Every SQL string passed to a query method, in call order.
     * JA: クエリメソッドへ渡された SQL 文字列を呼び出し順に保持する。
     *
     * @var array<int, string>
     */
    public array $queries = [];

    /**
     * EN: Pre-configured return value for the next get_row() call.
     * JA: 次の get_row() 呼び出しが返す事前設定値。
     */
    public mixed $row = null;

    /**
     * EN: Pre-configured return value for the next get_var() call.
     * JA: 次の get_var() 呼び出しが返す事前設定値。
     */
    public mixed $var = null;

    /**
     * EN: Pre-configured return value for the next get_results() call.
     * JA: 次の get_results() 呼び出しが返す事前設定値。
     *
     * @var array<int, object>|null
     */
    public ?array $results = null;

    /**
     * EN: Pre-configured return value for the next query() call.
     * JA: 次の query() 呼び出しが返す事前設定値。
     */
    public bool $queryResult = true;

    /**
     * EN: Record the SQL and return the configured single row.
     * JA: SQL を記録し、設定済みの 1 行を返す。
     */
    public function get_row(?string $query = null): mixed
    {
        if (null !== $query) {
            $this->queries[] = $query;
        }
        return $this->row;
    }

    /**
     * EN: Record the SQL and return the configured scalar.
     * JA: SQL を記録し、設定済みのスカラー値を返す。
     */
    public function get_var(?string $query = null): mixed
    {
        if (null !== $query) {
            $this->queries[] = $query;
        }
        return $this->var;
    }

    /**
     * EN: Record the SQL and return the configured result set.
     * JA: SQL を記録し、設定済みの結果セットを返す。
     *
     * @return array<int, object>|null
     */
    public function get_results(?string $query = null): ?array
    {
        if (null !== $query) {
            $this->queries[] = $query;
        }
        return $this->results;
    }

    /**
     * EN: Record the SQL and return the configured query result.
     * JA: SQL を記録し、設定済みのクエリ結果を返す。
     */
    public function query(string $query): bool
    {
        $this->queries[] = $query;
        return $this->queryResult;
    }

    /**
     * EN: The SQL string of the most recent query method call.
     * JA: 直近のクエリメソッド呼び出しの SQL 文字列。
     */
    public function lastQuery(): ?string
    {
        return $this->queries === [] ? null : end($this->queries);
    }
}
