#!/usr/bin/env bash
# EN: Run the 071-cli Behat functional test suite.
#     Brings up the dedicated test-database Docker Compose project
#     (tools/cli/tests/docker-compose.yml -- a MySQL 8 on host port 3307,
#     separate from the developer's own stack on 3306), waits for it to become
#     healthy, then runs Behat. The Behat FeatureContext reseeds the database
#     from tools/cli/tests/fixtures.sql before every scenario. Pass --keep to
#     leave the test database running after the run; by default it is left up
#     so repeated runs are fast (remove it with `docker compose -p
#     071-cli-test -f tools/cli/tests/docker-compose.yml down -v`).
# JA: 071-cli の Behat 機能テストスイートを実行する。
#     専用のテストデータベース Docker Compose プロジェクト
#     (tools/cli/tests/docker-compose.yml -- ホストポート 3307 の MySQL 8。
#     開発者自身の 3306 上のスタックとは別)を起動し、healthy になるのを待って
#     から Behat を実行する。Behat の FeatureContext は各シナリオの前に
#     tools/cli/tests/fixtures.sql からデータベースを再投入する。
set -euo pipefail

# EN: Resolve the repository root from this script's location. This script is
#     tools/cli/tests/run-behat.sh, so the repo root is three levels up.
# JA: このスクリプトの場所からリポジトリルートを解決する。本スクリプトは
#     tools/cli/tests/run-behat.sh であり、リポジトリルートは 3 つ上である。
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

PROJECT="071-cli-test"
COMPOSE_FILE="tools/cli/tests/docker-compose.yml"
CONTAINER="${PROJECT}-db-1"

echo "071-cli Behat: starting the test database (project ${PROJECT})..."
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d

echo "071-cli Behat: waiting for the test database to become healthy..."
for _ in $(seq 1 30); do
	status="$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo unknown)"
	if [ "$status" = "healthy" ]; then
		break
	fi
	sleep 2
done
if [ "$status" != "healthy" ]; then
	echo "071-cli Behat: test database did not become healthy in time." >&2
	exit 1
fi

echo "071-cli Behat: running the suite..."
exec vendor/bin/behat "$@"
