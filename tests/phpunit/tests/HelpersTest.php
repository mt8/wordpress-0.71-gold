<?php
/**
 * Tests for small pure helper functions in b2functions.php.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class HelpersTest extends TestCase
{
    public function testZeroisePadsNumberToThreshold(): void
    {
        $this->assertSame('05', zeroise(5, 2));
        $this->assertSame('0007', zeroise(7, 4));
    }

    public function testZeroiseLeavesLongEnoughNumberUnchanged(): void
    {
        // when no padding is needed zeroise() returns the value as given
        // (an int stays an int); only a padded result becomes a string.
        $this->assertSame(42, zeroise(42, 2));
        $this->assertSame(12345, zeroise(12345, 2));
    }

    public function testIsEmailAcceptsAValidAddress(): void
    {
        $this->assertTrue(is_email('test@example.com'));
    }

    public function testIsEmailRejectsAnInvalidAddress(): void
    {
        $this->assertFalse(is_email('not-an-email'));
    }

    public function testMysql2dateFormatsAStoredTimestamp(): void
    {
        $this->assertSame('2003', mysql2date('Y', '2003-05-27 12:34:56'));
        $this->assertSame('2003-05-27', mysql2date('Y-m-d', '2003-05-27 12:34:56'));
    }
}
