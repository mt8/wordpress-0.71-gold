<?php
/**
 * A test-support fake for the WordPress 0.71 `wpdb` database layer.
 * The legacy helpers in b2functions.php / b2template.functions.php read
 * the global $wpdb and call get_row() / get_results() / get_var() /
 * query() on it. Installing this stub as the $wpdb global lets those
 * database-dependent helpers be unit-tested without a live MySQL server:
 * the test pre-configures the return values, and the stub records every
 * SQL string it was asked to run so the test can assert on the query.
 */

declare(strict_types=1);

namespace Tests\Support;

final class FakeWpdb
{
    /**
     * Every SQL string passed to a query method, in call order.
     *
     * @var array<int, string>
     */
    public array $queries = [];

    /**
     * Pre-configured return value for the next get_row() call.
     */
    public mixed $row = null;

    /**
     * Pre-configured return value for the next get_var() call.
     */
    public mixed $var = null;

    /**
     * Pre-configured return value for the next get_results() call.
     *
     * @var array<int, object>|null
     */
    public ?array $results = null;

    /**
     * Pre-configured return value for the next query() call.
     */
    public bool $queryResult = true;

    /**
     * Record the SQL and return the configured single row.
     */
    public function get_row(?string $query = null): mixed
    {
        if (null !== $query) {
            $this->queries[] = $query;
        }
        return $this->row;
    }

    /**
     * Record the SQL and return the configured scalar.
     */
    public function get_var(?string $query = null): mixed
    {
        if (null !== $query) {
            $this->queries[] = $query;
        }
        return $this->var;
    }

    /**
     * Record the SQL and return the configured result set.
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
     * Record the SQL and return the configured query result.
     */
    public function query(string $query): bool
    {
        $this->queries[] = $query;
        return $this->queryResult;
    }

    /**
     * The SQL string of the most recent query method call.
     */
    public function lastQuery(): ?string
    {
        return $this->queries === [] ? null : end($this->queries);
    }
}
