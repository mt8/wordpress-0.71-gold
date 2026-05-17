# WordPress 0.71-gold development image / WordPress 0.71-gold 開発用イメージ
#
# EN: Based on the official PHP + Apache image. Per CLAUDE.md, customization is
#     kept to the necessary minimum. The PHP version is parameterised with a
#     build ARG defaulting to 8.3, so a plain `docker build` is unchanged while
#     071-env can pass PHP_VERSION (from `.071-env.json`'s `phpVersion`).
# JA: 公式 PHP + Apache イメージをベースとする。CLAUDE.md の方針に従い、
#     カスタマイズは必要最小限にとどめる。PHP バージョンは既定 8.3 のビルド
#     ARG でパラメータ化しており、素の `docker build` は変わらず、071-env は
#     PHP_VERSION (`.071-env.json` の `phpVersion`) を渡せる。
ARG PHP_VERSION=8.3
FROM php:${PHP_VERSION}-apache

# EN: Install the mysqli extension. WordPress 0.71's wpdb class originally uses
#     the ext/mysql API, which was removed in PHP 7.0; mysqli is the migration
#     target. The base image ships with neither extension.
# JA: mysqli 拡張をインストールする。WordPress 0.71 の wpdb クラスは PHP 7.0 で
#     廃止された ext/mysql API を使用しており、移行先は mysqli とする。ベース
#     イメージにはどちらの拡張も含まれていない。
RUN docker-php-ext-install mysqli

# EN: Raise PHP's upload limits. The php:8.3-apache defaults
#     (upload_max_filesize 2M, post_max_size 8M) are too small for the block
#     editor's image uploads; WordPress 0.71's own $fileupload_maxk is raised
#     to match in src/b2config.php (Issue #102).
# JA: PHP のアップロード上限を引き上げる。php:8.3-apache の既定
#     (upload_max_filesize 2M, post_max_size 8M) はブロックエディタの画像
#     アップロードには小さすぎる。WordPress 0.71 側の $fileupload_maxk も
#     src/b2config.php で整合させている (Issue #102)。
RUN printf 'upload_max_filesize = 16M\npost_max_size = 20M\n' \
	> /usr/local/etc/php/conf.d/uploads.ini
