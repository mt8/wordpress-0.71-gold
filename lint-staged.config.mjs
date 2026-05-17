// lint-staged configuration -- run by the husky pre-commit hook.
// For staged PHP files under src/ and tools/cli/php/ (the 071-cli tool,
// Issue #106):
//   - phpcs is scoped to the staged files;
//   - phpstan is run project-wide, because it resolves symbols across the
//     whole codebase; analysing only the staged files in isolation would
//     raise false "function/class not found" errors.
// The glob is tools/cli/php/, not tools/cli/, so it matches exactly the
// phpcs / phpstan scope (docs/071-tooling.md section 3.6). The Behat PHP
// under tools/cli/features/ is functional-test code (PSR-style, like the
// PHPUnit suite under tests/), deliberately outside the WordPress-Core
// style scan -- see docs/071-tooling.md section 3.7.
const phpChecks = ( stagedFiles ) => [
  `vendor/bin/phpcs ${ stagedFiles.join( ' ' ) }`,
  'vendor/bin/phpstan analyse --no-progress --memory-limit=1G',
];

export default {
  'src/**/*.php': phpChecks,
  'tools/cli/php/**/*.php': phpChecks,
};
