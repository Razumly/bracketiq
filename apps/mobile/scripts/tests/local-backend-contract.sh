#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
backend_script="$repo_root/scripts/ensure-local-backend.sh"
temporary_root="$(mktemp -d)"

cleanup() {
  if [[ -f "$temporary_root/state/service-pid" ]]; then
    kill -TERM "$(cat "$temporary_root/state/service-pid")" 2>/dev/null || true
  fi
  rm -rf "$temporary_root"
}
trap cleanup EXIT

fail() {
  echo "Local backend contract failed: $*" >&2
  exit 1
}

require_log_text() {
  local expected="$1"
  if ! rg --fixed-strings --quiet -- "$expected" "$fake_log"; then
    fail "missing invocation '$expected'"
  fi
}

reject_log_text() {
  local unexpected="$1"
  if rg --fixed-strings --quiet -- "$unexpected" "$fake_log"; then
    fail "unexpected invocation '$unexpected'"
  fi
}

first_log_line() {
  local expected="$1"
  rg --fixed-strings --line-number -- "$expected" "$fake_log" | head -n 1 | cut -d: -f1
}

fake_bin="$temporary_root/bin"
fake_state="$temporary_root/state"
backend_dir="$temporary_root/mvp-site"
fake_log="$fake_state/invocations.log"
mkdir -p "$fake_bin" "$fake_state" "$backend_dir" "$temporary_root/home"
backend_dir="$(cd "$backend_dir" && pwd -P)"

cat > "$backend_dir/package.json" <<'JSON'
{
  "name": "local-backend-contract-fixture",
  "private": true,
  "packageManager": "npm@10.9.2",
  "scripts": {
    "dev:plain": "node server.mjs --dev",
    "migrate:deploy": "prisma migrate deploy"
  }
}
JSON
printf '{"lockfileVersion":3}\n' > "$backend_dir/package-lock.json"
printf 'POSTGRES_PORT=55439\n' > "$backend_dir/.env.docker"

cat > "$fake_bin/npm" <<'FAKE_NPM'
#!/usr/bin/env bash
set -euo pipefail
printf 'npm|%s|%s\n' "$PWD" "$*" >> "$FAKE_STATE_DIR/invocations.log"
case "${1:-}" in
  --version)
    if [[ -f "$FAKE_STATE_DIR/npm-version" ]]; then
      cat "$FAKE_STATE_DIR/npm-version"
    else
      printf '10.9.2\n'
    fi
    ;;
  ci)
    printf 'install-database|primary=%s|live=%s\n' "${DATABASE_URL:-missing}" "${DATABASE_URL_LIVE:-missing}" >> "$FAKE_STATE_DIR/invocations.log"
    mkdir -p node_modules
    printf 'fresh install\n' > node_modules/.immutable-contract
    ;;
  run)
    [[ "${2:-}" == "migrate:deploy" ]]
    printf 'migration-database|primary=%s|live=%s\n' "${DATABASE_URL:-missing}" "${DATABASE_URL_LIVE:-missing}" >> "$FAKE_STATE_DIR/invocations.log"
    [[ ! -f "$FAKE_STATE_DIR/fail-migration" ]]
    ;;
  *)
    exit 64
    ;;
esac
FAKE_NPM

cat > "$fake_bin/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
set -euo pipefail
printf 'docker|%s|%s\n' "$PWD" "$*" >> "$FAKE_STATE_DIR/invocations.log"
if [[ -n "${DATABASE_URL:-}" || -n "${DATABASE_URL_LIVE:-}" ]]; then
  printf 'docker-inherited-database-environment\n' >> "$FAKE_STATE_DIR/invocations.log"
  exit 70
fi
if [[ "${1:-}" == "info" ]]; then
  exit 0
fi
if [[ " $* " == *" pg_isready -q "* ]]; then
  remaining=0
  if [[ -f "$FAKE_STATE_DIR/db-not-ready-count" ]]; then
    remaining="$(cat "$FAKE_STATE_DIR/db-not-ready-count")"
  fi
  if ((remaining > 0)); then
    printf '%s\n' "$((remaining - 1))" > "$FAKE_STATE_DIR/db-not-ready-count"
    exit 1
  fi
  exit 0
fi
if [[ " $* " == *" printenv POSTGRES_USER "* ]]; then
  printf '%s\n' "$FAKE_DB_USER"
  exit 0
fi
if [[ " $* " == *" printenv POSTGRES_PASSWORD "* ]]; then
  printf '%s\n' "$FAKE_DB_PASSWORD"
  exit 0
fi
if [[ " $* " == *" printenv POSTGRES_DB "* ]]; then
  printf '%s\n' "$FAKE_DB_NAME"
  exit 0
fi
if [[ " $* " == *" port db 5432 "* ]]; then
  if [[ "$FAKE_DB_BIND_HOST" == *:* ]]; then
    printf '[%s]:%s\n' "$FAKE_DB_BIND_HOST" "$FAKE_DB_PORT"
  else
    printf '%s:%s\n' "$FAKE_DB_BIND_HOST" "$FAKE_DB_PORT"
  fi
  exit 0
fi
exit 0
FAKE_DOCKER

cat > "$fake_bin/lsof" <<'FAKE_LSOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'lsof|%s\n' "$*" >> "$FAKE_STATE_DIR/invocations.log"
if [[ " $* " == *" -d cwd "* ]]; then
  pid=""
  previous=""
  for value in "$@"; do
    if [[ "$previous" == "-p" ]]; then pid="$value"; break; fi
    previous="$value"
  done
  printf 'p%s\nn%s\n' "$pid" "$FAKE_BACKEND_DIR"
  exit 0
fi
if [[ " $* " == *" -t "* ]]; then
  if [[ -f "$FAKE_STATE_DIR/port-in-use" && "$(cat "$FAKE_STATE_DIR/port-in-use")" == "1" ]]; then
    cat "$FAKE_STATE_DIR/listener-pids"
    exit 0
  fi
  exit 1
fi
[[ -f "$FAKE_STATE_DIR/port-in-use" && "$(cat "$FAKE_STATE_DIR/port-in-use")" == "1" ]]
FAKE_LSOF

cat > "$fake_bin/launchctl" <<'FAKE_LAUNCHCTL'
#!/usr/bin/env bash
set -euo pipefail
printf 'launchctl|%s\n' "$*" >> "$FAKE_STATE_DIR/invocations.log"
case "${1:-}" in
  submit)
    normalized_command="${*//\\/}"
    if [[ "$normalized_command" != *"DATABASE_URL=$FAKE_EXPECTED_DATABASE_URL"* ||
          "$normalized_command" != *"DATABASE_URL_LIVE=$FAKE_EXPECTED_DATABASE_URL"* ||
          "$normalized_command" == *"production.example.com"* ]]; then
      printf 'invalid-next-database-environment\n' >> "$FAKE_STATE_DIR/invocations.log"
      exit 72
    fi
    printf 'next-database|primary=%s|live=%s\n' "$FAKE_EXPECTED_DATABASE_URL" "$FAKE_EXPECTED_DATABASE_URL" >> "$FAKE_STATE_DIR/invocations.log"
    nohup /bin/bash -c 'cd "$1" && exec sleep 300' _ "$FAKE_BACKEND_DIR" </dev/null >/dev/null 2>&1 &
    service_pid=$!
    printf '%s\n' "$service_pid" > "$FAKE_STATE_DIR/service-pid"
    printf '%s\n' "$service_pid" > "$FAKE_STATE_DIR/listener-pids"
    printf '1\n' > "$FAKE_STATE_DIR/port-in-use"
    ;;
  list)
    [[ -f "$FAKE_STATE_DIR/service-pid" ]] || exit 1
    service_pid="$(cat "$FAKE_STATE_DIR/service-pid")"
    kill -0 "$service_pid" 2>/dev/null || exit 1
    printf '%s\t0\t%s\n' "$service_pid" "${2:-unknown}"
    ;;
  remove)
    if [[ -f "$FAKE_STATE_DIR/service-pid" ]]; then
      service_pid="$(cat "$FAKE_STATE_DIR/service-pid")"
      kill -TERM "$service_pid" 2>/dev/null || true
      rm -f "$FAKE_STATE_DIR/service-pid"
    fi
    : > "$FAKE_STATE_DIR/listener-pids"
    printf '0\n' > "$FAKE_STATE_DIR/port-in-use"
    ;;
  *)
    exit 64
    ;;
esac
FAKE_LAUNCHCTL

cat > "$fake_bin/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -euo pipefail
printf 'curl|%s\n' "$*" >> "$FAKE_STATE_DIR/invocations.log"
if [[ -f "$FAKE_STATE_DIR/curl-fails" ]]; then
  exit 22
fi
cat "$FAKE_STATE_DIR/readiness-payload"
FAKE_CURL

chmod +x "$fake_bin/npm" "$fake_bin/docker" "$fake_bin/lsof" "$fake_bin/launchctl" "$fake_bin/curl"

printf '%s\n' '{"updateAvailable":false,"updateRequired":false,"latestVersion":null,"releases":[]}' > "$fake_state/readiness-payload"
printf '0\n' > "$fake_state/port-in-use"
: > "$fake_state/listener-pids"

# The contract controls and then derives the configured backend port instead of
# depending on a developer's secrets.properties or assuming port 3000.
source "$backend_script"
configured_backend_port=43117
test_backend_port="$(MVP_BACKEND_PORT="$configured_backend_port" resolve_backend_port)"
[[ "$test_backend_port" == "$configured_backend_port" ]] || fail "backend port override was not derived"

property_repo="$temporary_root/property-port-repo"
mkdir -p "$property_repo"
for property_case in \
  'http://127.0.0.1:1/api|1' \
  'https://localhost:65535/api|65535' \
  'http://[::1]:43118/api|43118'; do
  property_url="${property_case%|*}"
  expected_property_port="${property_case##*|}"
  printf 'MVP_API_BASE_URL=%s\n' "$property_url" > "$property_repo/local.defaults.properties"
  property_port="$(REPO_ROOT="$property_repo" MVP_BACKEND_PORT= resolve_backend_port)"
  [[ "$property_port" == "$expected_property_port" ]] ||
    fail "property URL $property_url derived port $property_port instead of $expected_property_port"
done
printf 'MVP_API_BASE_URL=http://127.0.0.1:0/api\n' > "$property_repo/local.defaults.properties"
if (REPO_ROOT="$property_repo" MVP_BACKEND_PORT= resolve_backend_port) >/dev/null 2>&1; then
  fail "property-derived port 0 was accepted"
fi
printf 'MVP_API_BASE_URL=http://[::1]:65536/api\n' > "$property_repo/local.defaults.properties"
if (REPO_ROOT="$property_repo" MVP_BACKEND_PORT= resolve_backend_port) >/dev/null 2>&1; then
  fail "property-derived port 65536 was accepted"
fi

fake_db_port=55439
expected_database_url='postgresql://test%20user:p%40ss%3A%2F%3F@127.0.0.1:55439/mvp%20db?schema=public'

run_helper() {
  PATH="$fake_bin:$PATH" \
  HOME="$temporary_root/home" \
  FAKE_STATE_DIR="$fake_state" \
  FAKE_BACKEND_DIR="$backend_dir" \
  FAKE_DB_USER='test user' \
  FAKE_DB_PASSWORD='p@ss:/?' \
  FAKE_DB_NAME='mvp db' \
  FAKE_DB_BIND_HOST="${TEST_DB_BIND_HOST:-0.0.0.0}" \
  FAKE_DB_PORT="$fake_db_port" \
  FAKE_EXPECTED_DATABASE_URL="$expected_database_url" \
  MVP_SITE_DIR="$backend_dir" \
  MVP_BACKEND_PORT="$test_backend_port" \
  MVP_BACKEND_DB_TIMEOUT_SECONDS=20 \
  MVP_BACKEND_READY_TIMEOUT_SECONDS=4 \
  MVP_BACKEND_STOP_TIMEOUT_SECONDS=20 \
  MVP_BACKEND_POLL_INTERVAL_SECONDS=0.05 \
  DATABASE_URL='postgresql://live-user:live-password@production.example.com:25060/live' \
  DATABASE_URL_LIVE='postgresql://live-user:live-password@production.example.com:25060/live' \
  bash "$backend_script" --quiet
}

# Bootstrap order and identity: wait for the effective Compose DB, perform an
# immutable install every time, migrate that exact loopback DB, then probe only
# the DB-backed readiness endpoint.
: > "$fake_log"
printf '2\n' > "$fake_state/db-not-ready-count"
run_helper
require_log_text "npm|$backend_dir|--version"
require_log_text "npm|$backend_dir|ci"
require_log_text "npm|$backend_dir|run migrate:deploy"
require_log_text "migration-database|primary=$expected_database_url|live=$expected_database_url"
require_log_text "install-database|primary=$expected_database_url|live=$expected_database_url"
require_log_text "next-database|primary=$expected_database_url|live=$expected_database_url"
require_log_text 'pg_isready -q'
require_log_text "127.0.0.1:$fake_db_port"
require_log_text "/api/app-version?platform=ANDROID&versionName=0.0.0&buildNumber=0"
reject_log_text 'production.example.com'
reject_log_text 'docker-inherited-database-environment'
reject_log_text 'invalid-next-database-environment'
reject_log_text '|ls '
[[ ! -d "$backend_dir/.next/cache/mvp-local-backend.lock" ]] || fail "bootstrap lock leaked after success"

last_db_wait_line="$(rg --fixed-strings --line-number -- 'pg_isready -q' "$fake_log" | tail -n 1 | cut -d: -f1)"
install_line="$(first_log_line "npm|$backend_dir|ci")"
migration_line="$(first_log_line '|run migrate:deploy')"
readiness_line="$(first_log_line '/api/app-version?platform=ANDROID&versionName=0.0.0&buildNumber=0')"
if ((last_db_wait_line >= install_line || install_line >= migration_line || migration_line >= readiness_line)); then
  fail "database, install, migration, and readiness order was not fail-closed"
fi

# A second run still performs npm ci; a matching graph is never accepted as a
# substitute for rebuilding package bytes and native artifacts from the lockfile.
printf 'stale bytes\n' > "$backend_dir/node_modules/.immutable-contract"
: > "$fake_log"
run_helper
require_log_text "npm|$backend_dir|ci"
require_log_text "migration-database|primary=$expected_database_url|live=$expected_database_url"
if [[ "$(cat "$backend_dir/node_modules/.immutable-contract")" != "fresh install" ]]; then
  fail "the immutable reinstall left stale dependency bytes in place"
fi

# Migration failure is terminal and cannot start a server against the unmigrated
# database.
touch "$fake_state/fail-migration"
: > "$fake_log"
migration_error="$temporary_root/migration.err"
if run_helper > /dev/null 2> "$migration_error"; then
  fail "a failed tracked migration was ignored"
fi
require_log_text '|run migrate:deploy'
reject_log_text 'launchctl|submit'
[[ "$(cat "$fake_state/port-in-use")" == "0" ]] || fail "server started after migration failure"
rm "$fake_state/fail-migration"

# Non-loopback Compose bindings are rejected before install or migration.
: > "$fake_log"
remote_binding_error="$temporary_root/remote-binding.err"
if TEST_DB_BIND_HOST='production.example.com' run_helper > /dev/null 2> "$remote_binding_error"; then
  fail "a non-loopback Compose database binding was accepted"
fi
if ! rg --fixed-strings --quiet -- 'loopback or wildcard interface' "$remote_binding_error"; then
  fail "non-loopback Compose binding did not produce the expected diagnostic"
fi
reject_log_text "npm|$backend_dir|ci"
reject_log_text '|run migrate:deploy'

# IPv6-only bindings cannot be paired with the helper's explicit IPv4 URL.
: > "$fake_log"
ipv6_binding_error="$temporary_root/ipv6-binding.err"
if TEST_DB_BIND_HOST='::1' run_helper > /dev/null 2> "$ipv6_binding_error"; then
  fail "an IPv6-only Compose binding was accepted for an IPv4 database URL"
fi
if ! rg --fixed-strings --quiet -- 'loopback or wildcard interface' "$ipv6_binding_error"; then
  fail "IPv6-only Compose binding did not produce the expected diagnostic"
fi
reject_log_text "npm|$backend_dir|ci"
reject_log_text '|run migrate:deploy'

# packageManager is enforced using the version resolved from backend_dir.
printf '10.9.3\n' > "$fake_state/npm-version"
: > "$fake_log"
version_error="$temporary_root/package-manager-version.err"
if run_helper > /dev/null 2> "$version_error"; then
  fail "a package-manager version different from package.json was accepted"
fi
if ! rg --fixed-strings --quiet -- 'requires npm 10.9.2' "$version_error"; then
  fail "package-manager version mismatch did not produce the expected diagnostic"
fi
reject_log_text 'docker|'
rm "$fake_state/npm-version"

# Ambiguous lockfiles fail before Docker, dependency, migration, or server work.
printf 'lockfileVersion: 9\n' > "$backend_dir/pnpm-lock.yaml"
: > "$fake_log"
ambiguous_error="$temporary_root/ambiguous-lockfile.err"
if run_helper > /dev/null 2> "$ambiguous_error"; then
  fail "multiple package-manager lockfiles were accepted"
fi
if ! rg --fixed-strings --quiet -- 'exactly one supported lockfile' "$ambiguous_error"; then
  fail "ambiguous lockfiles did not produce the expected diagnostic"
fi
reject_log_text 'docker|'
rm "$backend_dir/pnpm-lock.yaml"

# A listener without a trusted ownership record is never stopped or reused.
if [[ -f "$fake_state/service-pid" ]]; then
  FAKE_STATE_DIR="$fake_state" FAKE_BACKEND_DIR="$backend_dir" \
    "$fake_bin/launchctl" remove "com.razumly.mvp-site-dev-$test_backend_port" >/dev/null
fi
rm -f "$backend_dir/.mvp-site-dev.pid"
sleep 300 &
unmanaged_listener=$!
printf '%s\n' "$unmanaged_listener" > "$fake_state/listener-pids"
printf '1\n' > "$fake_state/port-in-use"
: > "$fake_log"
unmanaged_error="$temporary_root/unmanaged-port.err"
if run_helper > /dev/null 2> "$unmanaged_error"; then
  fail "an unmanaged backend listener was accepted"
fi
kill -0 "$unmanaged_listener" 2>/dev/null || fail "the unmanaged listener was signaled"
kill -TERM "$unmanaged_listener" 2>/dev/null || true
wait "$unmanaged_listener" 2>/dev/null || true
printf '0\n' > "$fake_state/port-in-use"
: > "$fake_state/listener-pids"
reject_log_text 'docker|'

# A stale/reused recorded PID must not be signaled when another process owns the
# port. This is the two-process regression for the original unsafe cwd-only check.
numeric_backend="$temporary_root/numeric-managed-backend"
mkdir -p "$numeric_backend"
numeric_backend="$(cd "$numeric_backend" && pwd -P)"
(cd "$numeric_backend" && exec sleep 300) &
recorded_but_unrelated=$!
sleep 300 &
actual_listener=$!
process_cwd_matches "$recorded_but_unrelated" "$numeric_backend" || fail "two-process fixture did not preserve backend cwd"
recorded_fingerprint="$(process_start_fingerprint "$recorded_but_unrelated")"
printf 'process:%s:%s:%s:%s\n' "$recorded_but_unrelated" "$recorded_fingerprint" "$recorded_but_unrelated" "$test_backend_port" > "$numeric_backend/.mvp-site-dev.pid"
numeric_error="$temporary_root/numeric-owner.err"
if (
  source "$backend_script"
  is_port_in_use() { return 0; }
  listener_pids() { printf '%s\n' "$actual_listener"; }
  process_cwd_matches() { return 0; }
  ps() {
    if [[ "$*" == "-o pgid= -p $recorded_but_unrelated" ]]; then
      printf '%s\n' "$recorded_but_unrelated"
    else
      command ps "$@"
    fi
  }
  stop_managed_backend_or_fail "$numeric_backend" "$test_backend_port"
) > /dev/null 2> "$numeric_error"; then
  fail "a listener outside the recorded process tree was accepted"
fi
if ! rg --fixed-strings --quiet -- 'outside the recorded managed process tree' "$numeric_error"; then
  fail "process-tree mismatch did not produce the expected diagnostic"
fi
kill -0 "$recorded_but_unrelated" 2>/dev/null || fail "the stale/reused recorded PID was signaled"
kill -0 "$actual_listener" 2>/dev/null || fail "the actual unmanaged listener was signaled"
kill -TERM "$recorded_but_unrelated" "$actual_listener" 2>/dev/null || true
wait "$recorded_but_unrelated" 2>/dev/null || true
wait "$actual_listener" 2>/dev/null || true

# A port change still verifies and waits for the port stored with the process
# owner. Otherwise a child that survives the root process could leave the old
# backend reachable after the helper reports the replacement ready.
recorded_port_backend="$temporary_root/recorded-port-backend"
mkdir -p "$recorded_port_backend"
recorded_port=43119
requested_port=43120
recorded_process=98761
recorded_fingerprint='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
printf 'process:%s:%s:%s:%s\n' "$recorded_process" "$recorded_fingerprint" "$recorded_process" "$recorded_port" > "$recorded_port_backend/.mvp-site-dev.pid"
recorded_port_log="$temporary_root/recorded-port.log"
(
  source "$backend_script"
  is_port_in_use() { [[ "$1" == "$recorded_port" ]]; }
  process_identity_matches() { return 0; }
  process_cwd_matches() { return 0; }
  verify_listener_tree_ownership() { printf 'verify:%s:%s\n' "$1" "$2" >> "$recorded_port_log"; }
  ps() { printf '%s\n' "$recorded_process"; }
  kill() { printf 'signal:%s\n' "$*" >> "$recorded_port_log"; }
  wait_for_process_to_exit() { printf 'wait-process:%s\n' "$1" >> "$recorded_port_log"; }
  wait_for_port_to_close() { printf 'wait-port:%s\n' "$1" >> "$recorded_port_log"; }
  stop_managed_backend_or_fail "$recorded_port_backend" "$requested_port"
)
for expected_recorded_port_action in \
  "verify:$recorded_process:$recorded_port" \
  "signal:-TERM -- -$recorded_process" \
  "wait-process:$recorded_process" \
  "wait-port:$recorded_port" \
  "wait-port:$requested_port"; do
  if ! rg --fixed-strings --quiet -- "$expected_recorded_port_action" "$recorded_port_log"; then
    fail "port-change replacement omitted '$expected_recorded_port_action'"
  fi
done

# A dead root never authorizes forgetting a surviving listener on its recorded
# old port, for either process-supervisor format.
for stale_owner_kind in process launchctl; do
  stale_owner_backend="$temporary_root/stale-$stale_owner_kind-backend"
  mkdir -p "$stale_owner_backend"
  stale_recorded_port=43121
  stale_requested_port=43122
  stale_process=98762
  if [[ "$stale_owner_kind" == "process" ]]; then
    printf 'process:%s:%s:%s:%s\n' "$stale_process" "$recorded_fingerprint" "$stale_process" "$stale_recorded_port" > "$stale_owner_backend/.mvp-site-dev.pid"
  else
    printf 'launchctl:com.razumly.mvp-site-dev-%s:%s:%s\n' "$stale_recorded_port" "$stale_process" "$recorded_fingerprint" > "$stale_owner_backend/.mvp-site-dev.pid"
  fi
  stale_owner_error="$temporary_root/stale-$stale_owner_kind.err"
  if (
    source "$backend_script"
    is_port_in_use() { [[ "$1" == "$stale_recorded_port" ]]; }
    process_identity_matches() { return 1; }
    launchctl_service_pid() { return 1; }
    command_exists() { [[ "$1" == "launchctl" ]]; }
    stop_managed_backend_or_fail "$stale_owner_backend" "$stale_requested_port"
  ) > /dev/null 2> "$stale_owner_error"; then
    fail "a stale $stale_owner_kind root forgot a surviving recorded-port listener"
  fi
  if ! rg --fixed-strings --quiet -- 'requested or recorded backend port is occupied' "$stale_owner_error"; then
    fail "stale $stale_owner_kind root did not report the surviving recorded-port listener"
  fi
  [[ -f "$stale_owner_backend/.mvp-site-dev.pid" ]] ||
    fail "stale $stale_owner_kind root removed the only owner record for a surviving listener"
done

# Active bootstrap locks fail closed; stale locks are reclaimed and released.
lock_backend="$temporary_root/lock-backend"
lock_dir="$lock_backend/.next/cache/mvp-local-backend.lock"
mkdir -p "$(dirname "$lock_dir")"
active_lock_token="$(node "$repo_root/scripts/local-backend-lock.mjs" acquire "$lock_dir" "$$")"
active_lock_error="$temporary_root/active-lock.err"
if bash -c 'source "$1"; acquire_bootstrap_lock "$2"' _ "$backend_script" "$lock_backend" > /dev/null 2> "$active_lock_error"; then
  fail "an active bootstrap lock was stolen"
fi
if ! rg --fixed-strings --quiet -- 'already running' "$active_lock_error"; then
  fail "active bootstrap lock did not produce the expected diagnostic"
fi
node "$repo_root/scripts/local-backend-lock.mjs" release "$lock_dir" "$$" "$active_lock_token"
bash -c '
  owner_pid=$BASHPID
  node "$1" acquire "$2" "$owner_pid" > "$3"
' _ "$repo_root/scripts/local-backend-lock.mjs" "$lock_dir" "$temporary_root/dead-lock-token"
bash -c 'source "$1"; acquire_bootstrap_lock "$2"; release_bootstrap_lock' _ "$backend_script" "$lock_backend"
[[ ! -d "$lock_dir" ]] || fail "stale bootstrap lock was not reclaimed"

# HTTP 200 is insufficient: a generic payload fails readiness and the verified
# launch service is cleaned up.
printf '%s\n' '{"ok":true}' > "$fake_state/readiness-payload"
printf '0\n' > "$fake_state/port-in-use"
: > "$fake_state/listener-pids"
: > "$fake_log"
invalid_readiness_error="$temporary_root/invalid-readiness.err"
if run_helper > /dev/null 2> "$invalid_readiness_error"; then
  fail "a generic HTTP JSON payload satisfied backend readiness"
fi
if ! rg --fixed-strings --quiet -- 'database-backed readiness check' "$invalid_readiness_error"; then
  fail "invalid readiness did not produce the expected diagnostic"
fi
require_log_text "/api/app-version?platform=ANDROID&versionName=0.0.0&buildNumber=0"
require_log_text "launchctl|remove com.razumly.mvp-site-dev-$test_backend_port"
if rg --pcre2 --quiet -- "curl\|.*http://127\\.0\\.0\\.1:$test_backend_port/(?:\\s|$)" "$fake_log"; then
  fail "the helper used the root page as a readiness signal"
fi

echo "local backend freshness/readiness/ownership contract passed"
