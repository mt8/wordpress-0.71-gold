<?php
/**
 * Tests for the pure date / time / misc helpers in b2functions.php that
 * return a value with no database access.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class DateAndMiscHelpersTest extends TestCase
{
    public function testDateI18nFormatsAUnixTimestamp(): void
    {
        $timestamp = mktime(13, 5, 0, 5, 27, 2003);
        $this->assertSame('2003-05-27', date_i18n('Y-m-d', $timestamp));
        $this->assertSame('13:05', date_i18n('H:i', $timestamp));
    }

    public function testMysql2dateReturnsFalseForEmptyInput(): void
    {
        // an empty MySQL timestamp string yields false.
        $this->assertFalse(mysql2date('Y', ''));
    }

    public function testMysql2dateFormatsTimeComponents(): void
    {
        $this->assertSame('12:34:56', mysql2date('H:i:s', '2003-05-27 12:34:56'));
    }

    public function testGetWeekstartendReturnsStartAndEndTimestamps(): void
    {
        $week = get_weekstartend('2003-05-27 12:00:00', 0);

        $this->assertArrayHasKey('start', $week);
        $this->assertArrayHasKey('end', $week);
        $this->assertIsInt($week['start']);
        $this->assertIsInt($week['end']);
        // the week spans (end - start) -- 604799 seconds, just short of
        // seven days (7 * 86400 - 1).
        $this->assertSame(604799, $week['end'] - $week['start']);
    }

    public function testGetWeekstartendStartFallsOnTheStartOfWeekDay(): void
    {
        // with start_of_week = 0 (Sunday) the computed start is a Sunday.
        $week = get_weekstartend('2003-05-27 12:00:00', 0);
        $this->assertSame('0', date('w', $week['start']));
    }

    public function testTimerStartReturnsTrue(): void
    {
        $this->assertTrue(timer_start());
    }

    public function testTimerStopReturnsAnElapsedFloat(): void
    {
        timer_start();
        $elapsed = timer_stop();
        $this->assertIsFloat($elapsed);
        $this->assertGreaterThanOrEqual(0.0, $elapsed);
    }

    public function testAddslashesGpcEscapesQuotes(): void
    {
        $this->assertSame("it\\'s a \\\"test\\\"", addslashes_gpc('it\'s a "test"'));
    }

    public function testCockneyContractionsAreTexturized(): void
    {
        // wptexturize() rewrites cockney contractions with a curly apostrophe.
        $this->assertStringContainsString('&#8217;twas', wptexturize("'twas"));
    }

    public function testWptexturizeConvertsTrademarkAndCopyright(): void
    {
        $this->assertSame('&#8482;', wptexturize('(tm)'));
        $this->assertSame('&#169;', wptexturize('(c)'));
        $this->assertSame('&#174;', wptexturize('(r)'));
    }
}
