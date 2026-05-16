<?php
/**
 * EN: PHPUnit bootstrap. WordPress 0.71 is 2003-era procedural code; the
 *     starter suite tests the pure helpers in b2functions.php, which can be
 *     loaded standalone (no database connection). A minimal CLI environment
 *     is set up first so the legacy file loads without notices.
 * JA: PHPUnit ブートストラップ。WordPress 0.71 は 2003 年当時の手続き型コード。
 *     初期スイートは b2functions.php の純粋なヘルパーをテストする。これは
 *     単独で(DB 接続なしで)読み込める。レガシーファイルが notice 無しで
 *     読み込めるよう、先に最小限の CLI 環境を整える。
 */

declare(strict_types=1);

// EN: wptexturize() inspects the user-agent string; provide a dummy one.
// JA: wptexturize() はユーザーエージェント文字列を参照するため、ダミーを与える。
if (!isset($_SERVER['HTTP_USER_AGENT'])) {
    $_SERVER['HTTP_USER_AGENT'] = 'PHPUnit';
}

require __DIR__ . '/../src/b2-include/b2functions.php';
