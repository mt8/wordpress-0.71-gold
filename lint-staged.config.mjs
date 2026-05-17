// EN: lint-staged configuration -- run by the husky pre-commit hook.
//     For staged PHP files under src/ and tools/cli/php/ (the 071-cli tool,
//     Issue #106):
//       - phpcs is scoped to the staged files;
//       - phpstan is run project-wide, because it resolves symbols across the
//         whole codebase; analysing only the staged files in isolation would
//         raise false "function/class not found" errors.
//     The glob is tools/cli/php/, not tools/cli/, so it matches exactly the
//     phpcs / phpstan scope (docs/071-tooling.md section 3.6). The Behat PHP
//     under tools/cli/features/ is functional-test code (PSR-style, like the
//     PHPUnit suite under tests/), deliberately outside the WordPress-Core
//     style scan -- see docs/071-tooling.md section 3.7.
// JA: lint-staged の設定 -- husky の pre-commit フックが実行する。
//     src/ と tools/cli/php/(071-cli ツール、Issue #106)配下の staged な
//     PHP ファイルに対し:
//       - phpcs は staged ファイルに限定して実行する;
//       - phpstan はプロジェクト全体で実行する。コードベース全体で記号解決
//         するため、staged ファイルだけを単体解析すると誤検出の
//         "関数/クラスが見つかりません" エラーが出る。
//     glob は tools/cli/ ではなく tools/cli/php/ であり、phpcs / phpstan の
//     対象(docs/071-tooling.md セクション 3.6)と正確に一致する。
//     tools/cli/features/ 配下の Behat の PHP は機能テストコード(tests/
//     配下の PHPUnit スイートと同じ PSR スタイル)であり、WordPress-Core
//     スタイルスキャンの対象から意図的に外す -- docs/071-tooling.md
//     セクション 3.7 を参照。
const phpChecks = ( stagedFiles ) => [
  `vendor/bin/phpcs ${ stagedFiles.join( ' ' ) }`,
  'vendor/bin/phpstan analyse --no-progress --memory-limit=1G',
];

export default {
  'src/**/*.php': phpChecks,
  'tools/cli/php/**/*.php': phpChecks,
};
