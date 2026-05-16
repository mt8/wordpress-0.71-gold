<?php
/**
 * EN: Tests for the CSRF token helper b2_csrf_token() added in Issue #33.
 * JA: Issue #33 で追加した CSRF トークンヘルパー b2_csrf_token() のテスト。
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
        // EN: the token is seeded from the auth cookie, so a different cookie
        //     (i.e. a different user / session) must yield a different token.
        // JA: トークンは認証クッキーを種にするため、異なるクッキー
        //     (=異なるユーザー/セッション)では異なるトークンになる。
        $_COOKIE['wordpresspass'] = 'cookie-A';
        $tokenA = b2_csrf_token('save-post');

        $_COOKIE['wordpresspass'] = 'cookie-B';
        $tokenB = b2_csrf_token('save-post');

        $this->assertNotSame($tokenA, $tokenB);
    }

    public function testCsrfFieldPrintsAHiddenInputCarryingTheToken(): void
    {
        // EN: b2_csrf_field() echoes a hidden form input; capture and inspect it.
        // JA: b2_csrf_field() は隠しフォーム入力を出力する。捕捉して検証する。
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
