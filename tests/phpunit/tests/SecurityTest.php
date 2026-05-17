<?php
/**
 * Tests for the CSRF token helper b2_csrf_token() added in Issue #33.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class SecurityTest extends TestCase
{
    public function testCsrfTokenIsTwentyCharsAndDeterministic(): void
    {
        $_COOKIE['wordpresspass'] = 'cookie-value';
        $token = b2_csrf_token('save-post');

        $this->assertSame(20, strlen($token));
        $this->assertSame($token, b2_csrf_token('save-post'));
    }

    public function testCsrfTokenDiffersByAction(): void
    {
        $_COOKIE['wordpresspass'] = 'cookie-value';

        $this->assertNotSame(
            b2_csrf_token('save-post'),
            b2_csrf_token('delete-post')
        );
    }

    public function testCsrfTokenDiffersByAuthCookie(): void
    {
        // the token is seeded from the auth cookie, so a different cookie
        // (i.e. a different user / session) must yield a different token.
        $_COOKIE['wordpresspass'] = 'cookie-A';
        $tokenA = b2_csrf_token('save-post');

        $_COOKIE['wordpresspass'] = 'cookie-B';
        $tokenB = b2_csrf_token('save-post');

        $this->assertNotSame($tokenA, $tokenB);
    }

    public function testCsrfFieldPrintsAHiddenInputCarryingTheToken(): void
    {
        // b2_csrf_field() echoes a hidden form input; capture and inspect it.
        $_COOKIE['wordpresspass'] = 'cookie-value';

        ob_start();
        b2_csrf_field('save-post');
        $field = ob_get_clean();

        $this->assertStringContainsString('type="hidden"', $field);
        $this->assertStringContainsString('name="_b2csrf"', $field);
        $this->assertStringContainsString(
            'value="' . b2_csrf_token('save-post') . '"',
            $field
        );
    }
}
