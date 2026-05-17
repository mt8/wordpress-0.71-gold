<?php
/**
 * Tests for the database-dependent helpers in b2functions.php and
 * b2template.functions.php. These read the global $wpdb; the
 * DatabaseTestCase base installs a FakeWpdb stub plus the table-name
 * globals, so each helper can be exercised -- and the SQL it builds
 * asserted -- without a live MySQL server.
 */

declare(strict_types=1);

use Tests\Support\DatabaseTestCase;

final class DatabaseDependentFunctionsTest extends DatabaseTestCase
{
    public function testGetPostdataMapsTheRowIntoTheLegacyArray(): void
    {
        $this->wpdb->row = $this->makePostRow([
            'ID'           => 7,
            'post_author'  => 2,
            'post_title'   => 'Hello',
            'post_status'  => 'publish',
        ]);

        $postdata = get_postdata(7);

        $this->assertSame(7, $postdata['ID']);
        $this->assertSame(2, $postdata['Author_ID']);
        $this->assertSame('Hello', $postdata['Title']);
        $this->assertSame('publish', $postdata['post_status']);
    }

    public function testGetPostdataCastsTheIdAndBuildsTheExpectedSql(): void
    {
        // get_postdata() casts its id to int (SQL-injection guard from
        // Issue #31) and queries the posts table unquoted.
        $this->wpdb->row = $this->makePostRow();
        get_postdata('7abc');
        $this->assertSame(
            'SELECT * FROM b2posts WHERE ID = 7',
            $this->wpdb->lastQuery()
        );
    }

    public function testGetPostdataReturnsFalseForAMissingPost(): void
    {
        // a non-existent id yields a null row; get_postdata() returns false.
        $this->wpdb->row = null;
        $this->assertFalse(get_postdata(999));
    }

    public function testGetPostdata2ReadsTheGlobalPostObject(): void
    {
        // get_postdata2() runs no query -- it reads the global $post.
        $GLOBALS['post'] = $this->makePostRow(['ID' => 4, 'post_title' => 'Cached']);
        $postdata        = get_postdata2();
        $this->assertSame(4, $postdata['ID']);
        $this->assertSame('Cached', $postdata['Title']);
        $this->assertSame([], $this->wpdb->queries);
        unset($GLOBALS['post']);
    }

    public function testGetUserdataReturnsTheUserRow(): void
    {
        $this->wpdb->row = $this->makeUserRow(['ID' => 2, 'user_login' => 'bob']);
        $user            = get_userdata(2);
        $this->assertSame('bob', $user->user_login);
    }

    public function testGetUserdataCastsTheIdInTheSql(): void
    {
        $this->wpdb->row = $this->makeUserRow();
        get_userdata('2evil');
        $this->assertSame(
            'SELECT * FROM b2users WHERE ID = 2',
            $this->wpdb->lastQuery()
        );
    }

    public function testGetUserdatabyloginQueriesByLoginName(): void
    {
        $this->wpdb->row = $this->makeUserRow(['user_login' => 'alice']);
        $user            = get_userdatabylogin('alice');
        $this->assertSame('alice', $user->user_login);
        $this->assertSame(
            "SELECT * FROM b2users WHERE user_login = 'alice'",
            $this->wpdb->lastQuery()
        );
    }

    public function testGetUserdata2ReadsTheGlobalPostObject(): void
    {
        // get_userdata2() builds an array from the team-listing $post row.
        $GLOBALS['post'] = (object) [
            'user_login'     => 'team',
            'user_firstname' => 'First',
            'user_lastname'  => 'Last',
            'user_nickname'  => 'Nick',
            'user_level'     => 5,
            'user_email'     => 'team@example.com',
            'user_url'       => 'http://example.com',
        ];

        $data = get_userdata2(3);

        $this->assertSame(3, $data['ID']);
        $this->assertSame('team', $data['user_login']);
        $this->assertSame('Nick', $data['user_nickname']);
        unset($GLOBALS['post']);
    }

    public function testGetUseridReturnsTheScalarId(): void
    {
        $this->wpdb->var = 42;
        $this->assertSame(42, get_userid('bob'));
        $this->assertSame(
            "SELECT ID FROM b2users WHERE user_login = 'bob'",
            $this->wpdb->lastQuery()
        );
    }

    public function testGetUsernumpostsCountsAndCastsTheAuthorId(): void
    {
        $this->wpdb->var = 12;
        $this->assertSame(12, get_usernumposts('3xyz'));
        $this->assertSame(
            'SELECT COUNT(*) FROM b2posts WHERE post_author = 3',
            $this->wpdb->lastQuery()
        );
    }

    public function testGetSettingsReadsOneSettingFromTheSettingsRow(): void
    {
        $this->wpdb->row = (object) [
            'archive_mode' => 'monthly',
            'blog_charset' => 'UTF-8',
        ];
        $this->assertSame('monthly', get_settings('archive_mode'));
        $this->assertSame('UTF-8', get_settings('blog_charset'));
    }

    public function testGetTheCategoryReadsTheGlobalPostCategory(): void
    {
        $GLOBALS['post']               = new stdClass();
        $GLOBALS['post']->post_category = 4;
        $this->wpdb->var               = 'News';

        $this->assertSame('News', get_the_category());
        $this->assertSame(
            "SELECT cat_name FROM b2categories WHERE cat_ID = '4'",
            $this->wpdb->lastQuery()
        );
        unset($GLOBALS['post']);
    }

    public function testGetTheCategoryByIdQueriesTheGivenCategory(): void
    {
        $this->wpdb->var = 'Announcements';
        $this->assertSame('Announcements', get_the_category_by_ID(8));
        $this->assertSame(
            "SELECT cat_name FROM b2categories WHERE cat_ID = '8'",
            $this->wpdb->lastQuery()
        );
    }

    public function testGetTheCategoryStripsSlashesFromTheName(): void
    {
        // get_the_category() runs the category name through stripslashes().
        $this->wpdb->var = "O\\'Brien";
        $this->assertSame("O'Brien", get_the_category_by_ID(1));
    }
}
