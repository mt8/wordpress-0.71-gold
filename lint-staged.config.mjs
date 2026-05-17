// EN: lint-staged configuration -- run by the husky pre-commit hook.
//     For staged PHP files under src/ and cli/php/ (the 071-cli tool,
//     Issue #106):
//       - phpcs is scoped to the staged files;
//       - phpstan is run project-wide, because it resolves symbols across the
//         whole codebase; analysing only the staged files in isolation would
//         raise false "function/class not found" errors.
// JA: lint-staged の設定 -- husky の pre-commit フックが実行する。
//     src/ と cli/php/(071-cli ツール、Issue #106)配下の staged な PHP
//     ファイルに対し:
//       - phpcs は staged ファイルに限定して実行する;
//       - phpstan はプロジェクト全体で実行する。コードベース全体で記号解決
//         するため、staged ファイルだけを単体解析すると誤検出の
//         "関数/クラスが見つかりません" エラーが出る。
const phpChecks = ( stagedFiles ) => [
  `vendor/bin/phpcs ${ stagedFiles.join( ' ' ) }`,
  'vendor/bin/phpstan analyse --no-progress --memory-limit=1G',
];

export default {
  'src/**/*.php': phpChecks,
  'cli/**/*.php': phpChecks,
};
