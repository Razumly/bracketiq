#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
lock_helper="$repo_root/scripts/local-backend-lock.mjs"
bash_launcher="$repo_root/scripts/ensure-local-backend.sh"
windows_launcher="$repo_root/dev.ps1"
temporary_root="$(mktemp -d)"
child_pids=()

cleanup() {
  touch "$temporary_root/release" "$temporary_root/continue" 2>/dev/null || true
  local pid
  for pid in "${child_pids[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  for pid in "${child_pids[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
  rm -rf "$temporary_root"
}
trap cleanup EXIT

fail() {
  echo "Local backend lock contract failed: $*" >&2
  exit 1
}

for launcher in "$bash_launcher" "$windows_launcher"; do
  rg --fixed-strings --quiet -- 'mvp-local-backend.lock' "$launcher" ||
    fail "${launcher#$repo_root/} does not use the common lock path"
  rg --fixed-strings --quiet -- 'local-backend-lock.mjs' "$launcher" ||
    fail "${launcher#$repo_root/} does not use the common lock protocol helper"
  if rg --fixed-strings --quiet -- 'mvp-local-backend.windows.lock' "$launcher"; then
    fail "${launcher#$repo_root/} still uses the divergent Windows lock"
  fi
done

wait_for_path() {
  local path_to_wait_for="$1"
  local attempts=0
  while [[ ! -e "$path_to_wait_for" ]]; do
    attempts=$((attempts + 1))
    ((attempts < 500)) || fail "timed out waiting for $path_to_wait_for"
    sleep 0.01
  done
}

wait_for_winner() {
  local winner_file="$1"
  local attempts=0
  while [[ ! -s "$winner_file" ]]; do
    attempts=$((attempts + 1))
    ((attempts < 500)) || fail "timed out waiting for a lock winner"
    sleep 0.01
  done
}

start_contender() {
  local lock_path="$1"
  local start_file="$2"
  local winner_file="$3"
  local release_file="$4"
  local stderr_file="$5"
  bash -c '
    set -u
    helper="$1"
    lock_path="$2"
    start_file="$3"
    winner_file="$4"
    release_file="$5"
    while [[ ! -e "$start_file" ]]; do sleep 0.01; done
    token="$(node "$helper" acquire "$lock_path" "$$")" || exit $?
    printf "%s|%s\n" "$$" "$token" >> "$winner_file"
    while [[ ! -e "$release_file" ]]; do sleep 0.01; done
    node "$helper" release "$lock_path" "$$" "$token"
  ' _ "$lock_helper" "$lock_path" "$start_file" "$winner_file" "$release_file" \
    > /dev/null 2> "$stderr_file" &
  STARTED_PID=$!
  child_pids+=("$STARTED_PID")
}

lock_path="$temporary_root/cache/mvp-local-backend.lock"

# Exactly one of two isolated contenders can atomically publish a complete owner.
parallel_start="$temporary_root/parallel-start"
parallel_winner="$temporary_root/parallel-winner"
parallel_release="$temporary_root/parallel-release"
start_contender "$lock_path" "$parallel_start" "$parallel_winner" "$parallel_release" "$temporary_root/parallel-a.err"
parallel_a=$STARTED_PID
start_contender "$lock_path" "$parallel_start" "$parallel_winner" "$parallel_release" "$temporary_root/parallel-b.err"
parallel_b=$STARTED_PID
touch "$parallel_start"
wait_for_winner "$parallel_winner"
sleep 0.1
[[ "$(wc -l < "$parallel_winner" | tr -d ' ')" == "1" ]] || fail "parallel acquisition produced multiple owners"
[[ -s "$lock_path/owner.json" ]] || fail "published lock was missing complete owner metadata"
touch "$parallel_release"
set +e
wait "$parallel_a"; parallel_a_status=$?
wait "$parallel_b"; parallel_b_status=$?
set -e
if ! { [[ "$parallel_a_status" -eq 0 && "$parallel_b_status" -ne 0 ]] ||
       [[ "$parallel_b_status" -eq 0 && "$parallel_a_status" -ne 0 ]]; }; then
  fail "parallel contenders did not produce exactly one successful owner"
fi
[[ ! -e "$lock_path" ]] || fail "parallel winner did not release its lock"

# A contender paused with a fully prepared but unpublished directory cannot
# overwrite or evict a live owner that publishes first.
pause_signal="$temporary_root/pause-signal"
pause_continue="$temporary_root/pause-continue"
paused_winner="$temporary_root/paused-winner"
bash -c '
  set -u
  token="$(
    MVP_LOCK_TEST_BEFORE_PUBLISH_SIGNAL="$3" \
    MVP_LOCK_TEST_CONTINUE_FILE="$4" \
    node "$1" acquire "$2" "$$"
  )" || exit $?
  printf "%s\n" "$token" > "$5"
  node "$1" release "$2" "$$" "$token"
' _ "$lock_helper" "$lock_path" "$pause_signal" "$pause_continue" "$paused_winner" \
  > /dev/null 2> "$temporary_root/paused.err" &
paused_pid=$!
child_pids+=("$paused_pid")
wait_for_path "$pause_signal"

live_ready="$temporary_root/live-ready"
live_release="$temporary_root/live-release"
live_token_file="$temporary_root/live-token"
bash -c '
  set -u
  token="$(node "$1" acquire "$2" "$$")" || exit $?
  printf "%s\n" "$token" > "$3"
  touch "$4"
  while [[ ! -e "$5" ]]; do sleep 0.01; done
  node "$1" release "$2" "$$" "$token"
' _ "$lock_helper" "$lock_path" "$live_token_file" "$live_ready" "$live_release" \
  > /dev/null 2> "$temporary_root/live.err" &
live_pid=$!
child_pids+=("$live_pid")
wait_for_path "$live_ready"
touch "$pause_continue"
set +e
wait "$paused_pid"; paused_status=$?
set -e
[[ "$paused_status" -ne 0 ]] || fail "paused contender evicted a live owner"
[[ ! -e "$paused_winner" ]] || fail "paused contender unexpectedly acquired the lock"
kill -0 "$live_pid" 2>/dev/null || fail "live lock owner was terminated by the paused contender"
expected_live_token="$(cat "$live_token_file")"
published_live_token="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).token)' "$lock_path/owner.json")"
[[ "$published_live_token" == "$expected_live_token" ]] || fail "paused contender replaced live owner metadata"
touch "$live_release"
wait "$live_pid"
[[ ! -e "$lock_path" ]] || fail "live owner did not release after pause-race test"

# A killed holder leaves a complete stale owner. Two simultaneous contenders
# recover that generation safely and still elect exactly one new owner.
dead_ready="$temporary_root/dead-ready"
bash -c '
  set -u
  token="$(node "$1" acquire "$2" "$$")" || exit $?
  printf "%s\n" "$token" > "$3"
  touch "$4"
  while :; do sleep 1; done
' _ "$lock_helper" "$lock_path" "$temporary_root/dead-token" "$dead_ready" \
  > /dev/null 2> "$temporary_root/dead.err" &
dead_pid=$!
child_pids+=("$dead_pid")
wait_for_path "$dead_ready"
kill -KILL "$dead_pid"
set +e
wait "$dead_pid" 2>/dev/null
set -e
[[ -s "$lock_path/owner.json" ]] || fail "killed holder did not leave complete stale metadata"

recovery_start="$temporary_root/recovery-start"
recovery_winner="$temporary_root/recovery-winner"
recovery_release="$temporary_root/recovery-release"
start_contender "$lock_path" "$recovery_start" "$recovery_winner" "$recovery_release" "$temporary_root/recovery-a.err"
recovery_a=$STARTED_PID
start_contender "$lock_path" "$recovery_start" "$recovery_winner" "$recovery_release" "$temporary_root/recovery-b.err"
recovery_b=$STARTED_PID
touch "$recovery_start"
wait_for_winner "$recovery_winner"
sleep 0.1
[[ "$(wc -l < "$recovery_winner" | tr -d ' ')" == "1" ]] || fail "stale recovery produced multiple owners"
touch "$recovery_release"
set +e
wait "$recovery_a"; recovery_a_status=$?
wait "$recovery_b"; recovery_b_status=$?
set -e
if ! { [[ "$recovery_a_status" -eq 0 && "$recovery_b_status" -ne 0 ]] ||
       [[ "$recovery_b_status" -eq 0 && "$recovery_a_status" -ne 0 ]]; }; then
  fail "two stale-recovery contenders did not produce exactly one successful owner"
fi
[[ ! -e "$lock_path" ]] || fail "stale-recovery winner did not release its lock"

# Metadata from another host/platform is unverifiable and must never be reclaimed.
mkdir -p "$lock_path"
current_platform="$(node -p 'process.platform')"
printf '%s\n' \
  "{\"protocol\":\"mvp-local-backend-lock/v1\",\"token\":\"0123456789abcdef0123456789abcdef\",\"pid\":999999,\"platform\":\"$current_platform\",\"hostname\":\"other-host.invalid\",\"processIdentity\":null,\"createdAt\":\"2026-07-13T00:00:00.000Z\"}" \
  > "$lock_path/owner.json"
if node "$lock_helper" acquire "$lock_path" "$$" > /dev/null 2> "$temporary_root/foreign-owner.err"; then
  fail "an unverifiable cross-host lock was reclaimed"
fi
[[ -s "$lock_path/owner.json" ]] || fail "cross-host lock metadata was removed"

echo "cross-platform local backend lock contract passed"
