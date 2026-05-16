<?php
/**
 * EN: Shared base TestCase for the database-dependent legacy helpers.
 *     setUp() installs a fresh FakeWpdb as the $wpdb global, sets the
 *     table-name globals ($tableposts, $tableusers, ...) as fixtures, and
 *     disables the result cache so each test exercises a real query.
 *     tearDown() removes the globals it created so tests stay isolated.
 * JA: DB 依存のレガシーヘルパー向けの共有ベース TestCase。
 *     setUp() は新しい FakeWpdb を $wpdb グローバルとして差し込み、
 *     テーブル名グローバル($tableposts, $tableusers, ...)をフィクスチャと
 *     して設定し、結果キャッシュを無効化して各テストが実クエリを走らせる
 *     ようにする。tearDown() は生成したグローバルを除去しテストを分離する。
 */

declare(strict_types=1);

namespace Tests\Support;

use PHPUnit\Framework\TestCase;

abstract class DatabaseTestCase extends TestCase
{
    /**
     * EN: The fake $wpdb installed for the current test.
     * JA: 現在のテスト向けに差し込まれた偽の $wpdb。
     */
    protected FakeWpdb $wpdb;

    /**
     * EN: The global keys this base case sets up, removed again in tearDown().
     * JA: 本ベースケースが用意するグローバルキー。tearDown() で再び除去する。
     *
     * @var array<int, string>
     */
    private array $managedGlobals = [
        'wpdb',
        'querycount',
        'use_cache',
        'cache_userdata',
        'cache_settings',
        'cache_categories',
        'cache_catnames',
        'tableposts',
        'tableusers',
        'tablesettings',
        'tablecategories',
        'tablecomments',
        'tablelinks',
        'tablelinkcategories',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        $this->wpdb              = new FakeWpdb();
        $GLOBALS['wpdb']         = $this->wpdb;
        $GLOBALS['querycount']   = 0;

        // EN: disable the legacy in-process caches so every call hits $wpdb.
        // JA: レガシーなプロセス内キャッシュを無効化し、毎回 $wpdb に当てる。
        $GLOBALS['use_cache']         = 0;
        $GLOBALS['cache_userdata']    = [];
        $GLOBALS['cache_settings']    = [];
        $GLOBALS['cache_categories']  = [];
        $GLOBALS['cache_catnames']    = [];

        // EN: table-name globals -- the values used by src/b2config.php.
        // JA: テーブル名グローバル -- src/b2config.php で使われる値。
        $GLOBALS['tableposts']          = 'b2posts';
        $GLOBALS['tableusers']          = 'b2users';
        $GLOBALS['tablesettings']       = 'b2settings';
        $GLOBALS['tablecategories']     = 'b2categories';
        $GLOBALS['tablecomments']       = 'b2comments';
        $GLOBALS['tablelinks']          = 'b2links';
        $GLOBALS['tablelinkcategories'] = 'b2linkcategories';
    }

    protected function tearDown(): void
    {
        foreach ($this->managedGlobals as $key) {
            unset($GLOBALS[$key]);
        }
        parent::tearDown();
    }

    /**
     * EN: Build a stdClass post row with the columns the helpers read.
     *     Callers override individual fields via the $overrides array.
     * JA: ヘルパーが読む列を持つ stdClass の投稿行を組み立てる。
     *     呼び出し側は $overrides 配列で個別フィールドを上書きする。
     *
     * @param array<string, mixed> $overrides
     */
    protected function makePostRow(array $overrides = []): \stdClass
    {
        $defaults = [
            'ID'             => 1,
            'post_author'    => 1,
            'post_date'      => '2003-05-27 12:34:56',
            'post_content'   => 'Post content.',
            'post_excerpt'   => '',
            'post_title'     => 'A Post Title',
            'post_category'  => 1,
            'post_status'    => 'publish',
            'comment_status' => 'open',
            'ping_status'    => 'open',
            'post_password'  => '',
        ];

        return (object) array_merge($defaults, $overrides);
    }

    /**
     * EN: Build a stdClass user row with the columns the helpers read.
     * JA: ヘルパーが読む列を持つ stdClass のユーザー行を組み立てる。
     *
     * @param array<string, mixed> $overrides
     */
    protected function makeUserRow(array $overrides = []): \stdClass
    {
        $defaults = [
            'ID'             => 1,
            'user_login'     => 'admin',
            'user_pass'      => 'secret',
            'user_nickname'  => 'Admin',
            'user_email'     => 'admin@example.com',
            'user_url'       => 'http://example.com',
            'user_level'     => 10,
        ];

        return (object) array_merge($defaults, $overrides);
    }
}
