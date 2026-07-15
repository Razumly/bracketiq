#!/usr/bin/env bash

set -euo pipefail

QUIET=0
if [[ "${1:-}" == "--quiet" ]]; then
  QUIET=1
fi

log() {
  if [[ "$QUIET" -eq 0 ]]; then
    echo "[backend] $*" >&2
  fi
}

fail() {
  echo "[backend] ERROR: $*" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

get_property() {
  local file="$1"
  local key="$2"
  if [[ ! -f "$file" ]]; then
    return 1
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" ]] && continue
    [[ "${line:0:1}" == "#" ]] && continue
    if [[ "$line" == "$key="* ]]; then
      echo "${line#*=}"
      return 0
    fi
  done < "$file"
  return 1
}

resolve_backend_dir() {
  local candidates=()
  if [[ -n "${MVP_SITE_DIR:-}" ]]; then
    candidates+=("${MVP_SITE_DIR}")
  fi
  candidates+=(
    "$REPO_ROOT/../mvp-site"
    "$HOME/Documents/Code/mvp-site"
    "$HOME/Projects/MVP/mvp-site"
    "$HOME/StudioProjects/mvp-site"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -d "$candidate" && -f "$candidate/package.json" ]]; then
      (cd "$candidate" && pwd)
      return 0
    fi
  done
  return 1
}

extract_port() {
  local base_url="$1"
  node - "$base_url" <<'NODE'
const raw = process.argv[2];
let parsed;
try {
  parsed = new URL(raw);
} catch {
  process.exit(1);
}
if (parsed.protocol !== "http:" && parsed.protocol !== "https:") process.exit(1);

const authorityMatch = raw.match(
  /^https?:\/\/(?:[^/?#@]+@)?(?:\[[^\]]+\]|[^:/?#]+)(?::(?<port>\d+))?(?:[/?#]|$)/i,
);
if (!authorityMatch) process.exit(1);
const rawPort = authorityMatch.groups?.port;
if (rawPort === undefined) {
  process.stdout.write("3000\n");
  process.exit(0);
}
const port = Number(rawPort);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) process.exit(1);
process.stdout.write(`${port}\n`);
NODE
}

resolve_backend_port() {
  if [[ -n "${MVP_BACKEND_PORT:-}" ]]; then
    if [[ ! "$MVP_BACKEND_PORT" =~ ^[0-9]+$ ]] || ((MVP_BACKEND_PORT < 1 || MVP_BACKEND_PORT > 65535)); then
      fail "MVP_BACKEND_PORT must be an integer between 1 and 65535."
    fi
    echo "$MVP_BACKEND_PORT"
    return 0
  fi

  local base_url
  base_url="$(get_property "$REPO_ROOT/secrets.properties" "MVP_API_BASE_URL" || true)"
  if [[ -z "$base_url" ]]; then
    base_url="$(get_property "$REPO_ROOT/local.defaults.properties" "MVP_API_BASE_URL" || true)"
  fi
  if [[ -z "$base_url" ]]; then
    echo "3000"
    return 0
  fi
  local derived_port
  derived_port="$(extract_port "$base_url")" || fail "MVP_API_BASE_URL must be an HTTP(S) URL with a port between 1 and 65535 when one is specified."
  if [[ ! "$derived_port" =~ ^[0-9]+$ ]] || ((derived_port < 1 || derived_port > 65535)); then
    fail "The backend port derived from MVP_API_BASE_URL must be between 1 and 65535."
  fi
  echo "$derived_port"
}

configure_node_path() {
  if command_exists node && command_exists npm; then
    return 0
  fi
  if [[ -x "/opt/homebrew/opt/node@22/bin/node" ]]; then
    export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
    return 0
  fi
  if [[ -x "/usr/local/opt/node@22/bin/node" ]]; then
    export PATH="/usr/local/opt/node@22/bin:$PATH"
    return 0
  fi
}

sha256_text() {
  if command_exists shasum; then
    shasum -a 256 | awk '{ print $1 }'
    return 0
  fi
  if command_exists sha256sum; then
    sha256sum | awk '{ print $1 }'
    return 0
  fi
  fail "A SHA-256 implementation (shasum or sha256sum) is required."
}

process_start_fingerprint() {
  local pid="$1"
  local started
  if [[ -r "/proc/$pid/stat" ]]; then
    started="$(sed 's/^.*) //' "/proc/$pid/stat" 2>/dev/null | awk '{ print $20 }')"
    [[ "$started" =~ ^[0-9]+$ ]] || return 1
    started="proc:$started"
  else
    started="$(ps -o lstart= -p "$pid" 2>/dev/null || true)"
  fi
  started="${started#"${started%%[![:space:]]*}"}"
  started="${started%"${started##*[![:space:]]}"}"
  [[ -n "$started" ]] || return 1
  printf '%s' "$started" | sha256_text
}

process_identity_matches() {
  local pid="$1"
  local expected_fingerprint="$2"
  local actual_fingerprint
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  actual_fingerprint="$(process_start_fingerprint "$pid")" || return 1
  [[ "$actual_fingerprint" == "$expected_fingerprint" ]]
}

BOOTSTRAP_LOCK_PATH=""
BOOTSTRAP_LOCK_PID=""
BOOTSTRAP_LOCK_TOKEN=""

release_bootstrap_lock() {
  if [[ -z "$BOOTSTRAP_LOCK_PATH" || -z "$BOOTSTRAP_LOCK_PID" || -z "$BOOTSTRAP_LOCK_TOKEN" ]]; then
    return 0
  fi

  if ! node "$REPO_ROOT/scripts/local-backend-lock.mjs" release \
    "$BOOTSTRAP_LOCK_PATH" "$BOOTSTRAP_LOCK_PID" "$BOOTSTRAP_LOCK_TOKEN" >/dev/null; then
    log "WARNING: Could not safely release backend bootstrap lock $BOOTSTRAP_LOCK_PATH"
  fi
  BOOTSTRAP_LOCK_PATH=""
  BOOTSTRAP_LOCK_PID=""
  BOOTSTRAP_LOCK_TOKEN=""
}

acquire_bootstrap_lock() {
  local backend_dir="$1"
  local lock_parent="$backend_dir/.next/cache"
  local lock_path="$lock_parent/mvp-local-backend.lock"
  mkdir -p "$lock_parent"
  local owner_pid="$$"
  local lock_token
  lock_token="$(node "$REPO_ROOT/scripts/local-backend-lock.mjs" acquire "$lock_path" "$owner_pid")" ||
    fail "Could not acquire the local-backend bootstrap lock."
  [[ "$lock_token" =~ ^[a-f0-9]{32}$ ]] || fail "The backend lock helper returned an invalid owner token."

  BOOTSTRAP_LOCK_PATH="$lock_path"
  BOOTSTRAP_LOCK_PID="$owner_pid"
  BOOTSTRAP_LOCK_TOKEN="$lock_token"
  trap release_bootstrap_lock EXIT
}

read_declared_package_manager() {
  local package_json="$1"
  node - "$package_json" <<'NODE'
const fs = require('node:fs');
const packageJson = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (typeof packageJson.packageManager === 'string') {
  process.stdout.write(packageJson.packageManager.trim());
}
NODE
}

detect_package_manager() {
  local backend_dir="$1"
  local lockfiles=()
  local lockfile
  for lockfile in package-lock.json npm-shrinkwrap.json pnpm-lock.yaml yarn.lock; do
    if [[ -f "$backend_dir/$lockfile" ]]; then
      lockfiles+=("$lockfile")
    fi
  done

  if [[ "${#lockfiles[@]}" -ne 1 ]]; then
    fail "mvp-site must contain exactly one supported lockfile (package-lock.json, npm-shrinkwrap.json, pnpm-lock.yaml, or yarn.lock); found ${#lockfiles[@]}."
  fi

  local pm
  case "${lockfiles[0]}" in
    package-lock.json|npm-shrinkwrap.json)
      pm="npm"
      ;;
    pnpm-lock.yaml)
      pm="pnpm"
      ;;
    yarn.lock)
      pm="yarn"
      ;;
    *)
      fail "Unsupported lockfile ${lockfiles[0]}."
      ;;
  esac

  if ! command_exists "$pm"; then
    fail "$pm is required by ${lockfiles[0]} but was not found on PATH."
  fi
  if ! command_exists node; then
    fail "node was not found on PATH."
  fi

  printf '%s|%s\n' "$pm" "${lockfiles[0]}"
}

package_manager_version() {
  local backend_dir="$1"
  local pm="$2"
  local version
  version="$(cd "$backend_dir" && env -u DATABASE_URL -u DATABASE_URL_LIVE "$pm" --version)" || fail "Could not determine the $pm version in $backend_dir."
  version="${version%%$'\n'*}"
  version="${version%$'\r'}"
  if [[ -z "$version" ]]; then
    fail "$pm returned an empty version."
  fi
  printf '%s\n' "$version"
}

enforce_declared_package_manager() {
  local backend_dir="$1"
  local pm="$2"
  local pm_version="$3"
  local declared_pm
  declared_pm="$(read_declared_package_manager "$backend_dir/package.json")" || fail "Could not read packageManager from mvp-site/package.json."
  [[ -n "$declared_pm" ]] || return 0

  local declared_name="$declared_pm"
  local declared_version=""
  if [[ "$declared_pm" == *"@"* ]]; then
    declared_name="${declared_pm%%@*}"
    declared_version="${declared_pm#*@}"
    declared_version="${declared_version%%+*}"
  fi
  if [[ "$declared_name" != "$pm" ]]; then
    fail "package.json declares $declared_pm but the selected lockfile requires $pm."
  fi
  if [[ -n "$declared_version" && "$declared_version" != "$pm_version" ]]; then
    fail "package.json requires $pm $declared_version, but $pm $pm_version is active in $backend_dir."
  fi
}

immutable_dependency_install() {
  local backend_dir="$1"
  local pm="$2"
  local pm_version="$3"
  local database_url="$4"

  case "$pm" in
    npm)
      (cd "$backend_dir" && env DATABASE_URL="$database_url" DATABASE_URL_LIVE="$database_url" npm ci)
      ;;
    pnpm)
      (cd "$backend_dir" && env DATABASE_URL="$database_url" DATABASE_URL_LIVE="$database_url" pnpm install --frozen-lockfile)
      ;;
    yarn)
      if [[ "${pm_version%%.*}" == "1" ]]; then
        (cd "$backend_dir" && env DATABASE_URL="$database_url" DATABASE_URL_LIVE="$database_url" yarn install --frozen-lockfile)
      else
        (cd "$backend_dir" && env DATABASE_URL="$database_url" DATABASE_URL_LIVE="$database_url" yarn install --immutable)
      fi
      ;;
    *)
      fail "Unsupported package manager $pm."
      ;;
  esac
}

ensure_backend_dependencies() {
  local backend_dir="$1"
  local pm="$2"
  local lockfile="$3"
  local pm_version="$4"
  local database_url="$5"

  log "Rebuilding backend dependencies immutably from $lockfile with $pm $pm_version"
  immutable_dependency_install "$backend_dir" "$pm" "$pm_version" "$database_url"
}

ensure_docker_daemon() {
  if ! command_exists docker; then
    fail "Docker is not installed."
  fi

  if env -u DATABASE_URL -u DATABASE_URL_LIVE docker info >/dev/null 2>&1; then
    return 0
  fi

  if command_exists open; then
    open -a Docker >/dev/null 2>&1 || true
  fi

  local i
  for i in {1..60}; do
    if env -u DATABASE_URL -u DATABASE_URL_LIVE docker info >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  fail "Docker daemon is not running."
}

run_compose() {
  local backend_dir="$1"
  shift
  if [[ -f "$backend_dir/.env.docker" ]]; then
    (cd "$backend_dir" && env -u DATABASE_URL -u DATABASE_URL_LIVE docker compose --env-file .env.docker "$@")
  else
    (cd "$backend_dir" && env -u DATABASE_URL -u DATABASE_URL_LIVE docker compose "$@")
  fi
}

ensure_database() {
  local backend_dir="$1"
  ensure_docker_daemon
  run_compose "$backend_dir" up -d db >/dev/null
}

wait_for_database() {
  local backend_dir="$1"
  local timeout="${MVP_BACKEND_DB_TIMEOUT_SECONDS:-90}"
  local poll_interval="${MVP_BACKEND_POLL_INTERVAL_SECONDS:-1}"
  local i

  log "Waiting for the local Postgres service to accept connections"
  for ((i = 0; i < timeout; i++)); do
    if run_compose "$backend_dir" exec -T db pg_isready -q >/dev/null 2>&1; then
      return 0
    fi
    sleep "$poll_interval"
  done

  return 1
}

compose_database_value() {
  local backend_dir="$1"
  local key="$2"
  local value
  value="$(run_compose "$backend_dir" exec -T db printenv "$key" 2>/dev/null)" || fail "Could not read $key from the effective Compose db service."
  value="${value%%$'\n'*}"
  value="${value%$'\r'}"
  [[ -n "$value" ]] || fail "The effective Compose db service has an empty $key."
  printf '%s\n' "$value"
}

compose_database_port() {
  local backend_dir="$1"
  local bindings first_binding host port
  bindings="$(run_compose "$backend_dir" port db 5432 2>/dev/null)" || fail "Could not resolve the effective Compose db port."
  first_binding="${bindings%%$'\n'*}"
  first_binding="${first_binding%$'\r'}"

  if [[ "$first_binding" =~ ^\[([^]]+)\]:([0-9]+)$ ]]; then
    host="${BASH_REMATCH[1]}"
    port="${BASH_REMATCH[2]}"
  elif [[ "$first_binding" =~ ^([^:]+):([0-9]+)$ ]]; then
    host="${BASH_REMATCH[1]}"
    port="${BASH_REMATCH[2]}"
  else
    fail "Unsupported Compose db port binding: $first_binding"
  fi

  case "$host" in
    0.0.0.0|127.0.0.1|localhost)
      ;;
    *)
      fail "Compose db must publish on an IPv4 loopback or wildcard interface because the derived URL uses 127.0.0.1; found $host."
      ;;
  esac
  if ((port < 1 || port > 65535)); then
    fail "Compose db published an invalid port: $port"
  fi
  printf '%s\n' "$port"
}

derive_compose_database_url() {
  local backend_dir="$1"
  local db_user db_password db_name db_port
  db_user="$(compose_database_value "$backend_dir" POSTGRES_USER)"
  db_password="$(compose_database_value "$backend_dir" POSTGRES_PASSWORD)"
  db_name="$(compose_database_value "$backend_dir" POSTGRES_DB)"
  db_port="$(compose_database_port "$backend_dir")"

  node - "$db_user" "$db_password" "$db_name" "$db_port" <<'NODE'
const [user, password, database, port] = process.argv.slice(2);
if (!/^\d+$/.test(port)) process.exit(1);
const encode = encodeURIComponent;
process.stdout.write(
  `postgresql://${encode(user)}:${encode(password)}@127.0.0.1:${port}/${encode(database)}?schema=public`,
);
NODE
}

run_package_script() {
  local backend_dir="$1"
  local pm="$2"
  local script_name="$3"
  local database_url="$4"
  case "$pm" in
    npm)
      (cd "$backend_dir" && env DATABASE_URL="$database_url" DATABASE_URL_LIVE="$database_url" npm run "$script_name")
      ;;
    pnpm)
      (cd "$backend_dir" && env DATABASE_URL="$database_url" DATABASE_URL_LIVE="$database_url" pnpm run "$script_name")
      ;;
    yarn)
      (cd "$backend_dir" && env DATABASE_URL="$database_url" DATABASE_URL_LIVE="$database_url" yarn run "$script_name")
      ;;
    *)
      fail "Unsupported package manager $pm."
      ;;
  esac
}

is_port_in_use() {
  local port="$1"
  if command_exists lsof; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  if command_exists ss; then
    ss -ltn "sport = :$port" 2>/dev/null | awk 'NR > 1 { found = 1 } END { exit(found ? 0 : 1) }'
    return $?
  fi
  if command_exists nc; then
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1
    return $?
  fi

  # This is only a listener check. Readiness is always established separately
  # through the database-backed app-version API.
  curl -sS --max-time 2 "http://127.0.0.1:${port}/api/app-version?platform=ANDROID&versionName=0.0.0&buildNumber=0" >/dev/null 2>&1
}

process_cwd_matches() {
  local pid="$1"
  local backend_dir="$2"
  local process_cwd=""
  local expected_cwd
  expected_cwd="$(cd "$backend_dir" 2>/dev/null && pwd -P)" || return 1

  if [[ -L "/proc/$pid/cwd" ]]; then
    process_cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
  elif command_exists lsof; then
    process_cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ { sub(/^n/, ""); print; exit }')"
  fi

  [[ -n "$process_cwd" && "$process_cwd" == "$expected_cwd" ]]
}

listener_pids() {
  local port="$1"
  local output=""
  if command_exists lsof; then
    output="$(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  elif command_exists ss; then
    output="$(ss -ltnp "sport = :$port" 2>/dev/null | awk '
      {
        line = $0
        while (match(line, /pid=[0-9]+/)) {
          print substr(line, RSTART + 4, RLENGTH - 4)
          line = substr(line, RSTART + RLENGTH)
        }
      }
    ')"
  else
    return 2
  fi
  printf '%s\n' "$output" | awk '/^[0-9]+$/ && !seen[$0]++ { print }'
}

process_parent_pid() {
  local pid="$1"
  local parent
  parent="$(ps -o ppid= -p "$pid" 2>/dev/null || true)"
  parent="${parent//[[:space:]]/}"
  [[ "$parent" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$parent"
}

process_is_in_tree() {
  local root_pid="$1"
  local candidate_pid="$2"
  local current="$candidate_pid"
  local depth
  for ((depth = 0; depth < 256; depth++)); do
    [[ "$current" == "$root_pid" ]] && return 0
    [[ "$current" =~ ^[0-9]+$ ]] || return 1
    ((current > 1)) || return 1
    current="$(process_parent_pid "$current")" || return 1
  done
  return 1
}

verify_listener_tree_ownership() {
  local root_pid="$1"
  local port="$2"
  local owners
  owners="$(listener_pids "$port")" || fail "Cannot safely identify the process listening on port $port. Install lsof or ss."
  [[ -n "$owners" ]] || fail "Port $port is in use, but its owning process could not be identified safely."

  local owner_pid
  while IFS= read -r owner_pid; do
    [[ -n "$owner_pid" ]] || continue
    if ! process_is_in_tree "$root_pid" "$owner_pid"; then
      fail "Port $port is owned by PID $owner_pid, outside the recorded managed process tree rooted at PID $root_pid."
    fi
  done <<< "$owners"
}

launchctl_service_pid() {
  local label="$1"
  local output
  output="$(launchctl list "$label" 2>/dev/null)" || return 1
  printf '%s\n' "$output" | awk '
    $1 ~ /^[0-9]+$/ { print $1; exit }
    /"PID"[[:space:]]*=/ || /pid[[:space:]]*=/ {
      for (i = 1; i <= NF; i += 1) {
        value = $i
        gsub(/[^0-9]/, "", value)
        if (value != "") { print value; exit }
      }
    }
  '
}

write_managed_state() {
  local pid_file="$1"
  local state="$2"
  local temporary="$pid_file.tmp.$$"
  printf '%s\n' "$state" > "$temporary"
  mv "$temporary" "$pid_file"
}

verify_managed_backend_listener_or_fail() {
  local backend_dir="$1"
  local port="$2"
  local pid_file="$backend_dir/.mvp-site-dev.pid"
  local state
  state="$(cat "$pid_file" 2>/dev/null || true)"
  local root_pid fingerprint kind label pgid recorded_port extra

  if [[ "$state" == launchctl:*:*:* ]]; then
    IFS=':' read -r kind label root_pid fingerprint extra <<< "$state"
    [[ "$kind" == "launchctl" && "$label" == "com.razumly.mvp-site-dev-$port" && -z "$extra" ]] ||
      fail "The running backend launch-service owner record is malformed."
    [[ "$(launchctl_service_pid "$label" || true)" == "$root_pid" ]] ||
      fail "The running backend launch service no longer matches its owner record."
  elif [[ "$state" == process:*:*:*:* ]]; then
    IFS=':' read -r kind root_pid fingerprint pgid recorded_port extra <<< "$state"
    [[ "$kind" == "process" && "$pgid" =~ ^[0-9]+$ && "$recorded_port" == "$port" && -z "$extra" ]] ||
      fail "The running backend process owner record is malformed or targets a different port."
  else
    fail "The backend became reachable without a trusted managed owner record."
  fi

  process_identity_matches "$root_pid" "$fingerprint" || fail "The backend owner process identity changed during startup."
  process_cwd_matches "$root_pid" "$backend_dir" || fail "The backend owner process is not running from $backend_dir."
  is_port_in_use "$port" || fail "The backend readiness route responded, but no listener remains on port $port."
  verify_listener_tree_ownership "$root_pid" "$port"
}

wait_for_port_to_close() {
  local port="$1"
  local timeout="${MVP_BACKEND_STOP_TIMEOUT_SECONDS:-15}"
  local poll_interval="${MVP_BACKEND_POLL_INTERVAL_SECONDS:-1}"
  local i
  for ((i = 0; i < timeout; i++)); do
    if ! is_port_in_use "$port"; then
      return 0
    fi
    sleep "$poll_interval"
  done
  return 1
}

wait_for_process_to_exit() {
  local pid="$1"
  local timeout="${MVP_BACKEND_STOP_TIMEOUT_SECONDS:-15}"
  local poll_interval="${MVP_BACKEND_POLL_INTERVAL_SECONDS:-1}"
  local i
  for ((i = 0; i < timeout; i++)); do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    sleep "$poll_interval"
  done
  return 1
}

stop_managed_backend_or_fail() {
  local backend_dir="$1"
  local port="$2"
  local pid_file="$backend_dir/.mvp-site-dev.pid"
  local state=""
  local port_in_use=0

  if is_port_in_use "$port"; then
    port_in_use=1
  fi
  if [[ -f "$pid_file" ]]; then
    state="$(cat "$pid_file" 2>/dev/null || true)"
  fi

  if [[ -z "$state" ]]; then
    if [[ "$port_in_use" -eq 1 ]]; then
      fail "Port $port is already used by an unmanaged process. Stop it explicitly before launching mvp-site."
    fi
    return 0
  fi

  if [[ "$state" == launchctl:*:*:* ]]; then
    local kind label recorded_pid recorded_fingerprint extra
    IFS=':' read -r kind label recorded_pid recorded_fingerprint extra <<< "$state"
    local recorded_port=""
    if [[ "$label" =~ ^com\.razumly\.mvp-site-dev-([0-9]+)$ ]]; then
      recorded_port="${BASH_REMATCH[1]}"
    fi
    if [[ "$kind" != "launchctl" || -z "$recorded_port" || -n "$extra" ]]; then
      fail "The managed launch-service owner record is malformed; refusing to remove it or signal any process."
    fi
    local recorded_port_in_use="$port_in_use"
    if [[ "$recorded_port" != "$port" ]]; then
      recorded_port_in_use=0
      if is_port_in_use "$recorded_port"; then
        recorded_port_in_use=1
      fi
    fi
    if ! command_exists launchctl; then
      if [[ "$port_in_use" -eq 1 || "$recorded_port_in_use" -eq 1 ]]; then
        fail "A requested or recorded backend port belongs to managed launch service $label, but launchctl is unavailable."
      fi
      rm -f "$pid_file"
      return 0
    fi

    local current_pid=""
    current_pid="$(launchctl_service_pid "$label" || true)"
    if [[ -z "$current_pid" ]]; then
      if [[ "$port_in_use" -eq 1 || "$recorded_port_in_use" -eq 1 ]]; then
        fail "A requested or recorded backend port is occupied, but managed launch service $label has no verifiable process."
      fi
      launchctl remove "$label" >/dev/null 2>&1 || true
      rm -f "$pid_file"
      return 0
    fi
    if [[ "$current_pid" != "$recorded_pid" ]] || ! process_identity_matches "$recorded_pid" "$recorded_fingerprint"; then
      fail "Managed launch service $label no longer matches its recorded process identity; refusing to signal it."
    fi
    if ! process_cwd_matches "$recorded_pid" "$backend_dir"; then
      fail "Managed launch service $label is not running from $backend_dir; refusing to signal it."
    fi
    if [[ "$port_in_use" -eq 1 ]]; then
      verify_listener_tree_ownership "$recorded_pid" "$port"
    fi
    if [[ "$recorded_port" != "$port" && "$recorded_port_in_use" -eq 1 ]]; then
      verify_listener_tree_ownership "$recorded_pid" "$recorded_port"
    fi

    log "Stopping verified managed backend launch service $label"
    if ! launchctl remove "$label" >/dev/null 2>&1; then
      fail "Could not stop managed backend launch service $label."
    fi
    if ! wait_for_process_to_exit "$recorded_pid"; then
      fail "Managed launch service process $recorded_pid did not exit."
    fi
    if [[ "$recorded_port" != "$port" ]] && ! wait_for_port_to_close "$recorded_port"; then
      fail "Managed launch service did not release its recorded port $recorded_port."
    fi
  elif [[ "$state" == process:*:*:*:* ]]; then
    local kind recorded_pid recorded_fingerprint recorded_pgid recorded_port extra
    IFS=':' read -r kind recorded_pid recorded_fingerprint recorded_pgid recorded_port extra <<< "$state"
    if [[ "$kind" != "process" || -n "$extra" || ! "$recorded_pgid" =~ ^[0-9]+$ ||
          ! "$recorded_port" =~ ^[0-9]+$ || "$recorded_port" -lt 1 || "$recorded_port" -gt 65535 ]]; then
      fail "The managed backend owner record is malformed; refusing to signal any process."
    fi
    local recorded_port_in_use="$port_in_use"
    if [[ "$recorded_port" != "$port" ]]; then
      recorded_port_in_use=0
      if is_port_in_use "$recorded_port"; then
        recorded_port_in_use=1
      fi
    fi
    if ! process_identity_matches "$recorded_pid" "$recorded_fingerprint"; then
      if [[ "$port_in_use" -eq 1 || "$recorded_port_in_use" -eq 1 ]]; then
        fail "A requested or recorded backend port is occupied, but the recorded managed process identity is stale."
      fi
      rm -f "$pid_file"
      return 0
    fi
    if ! process_cwd_matches "$recorded_pid" "$backend_dir"; then
      fail "Recorded PID $recorded_pid is not running from $backend_dir; refusing to signal it."
    fi
    local current_pgid
    current_pgid="$(ps -o pgid= -p "$recorded_pid" 2>/dev/null || true)"
    current_pgid="${current_pgid//[[:space:]]/}"
    if [[ "$current_pgid" != "$recorded_pgid" || "$recorded_pgid" != "$recorded_pid" ]]; then
      fail "Recorded PID $recorded_pid no longer owns its managed process group; refusing to signal it."
    fi
    if [[ "$port_in_use" -eq 1 ]]; then
      verify_listener_tree_ownership "$recorded_pid" "$port"
    fi
    if [[ "$recorded_port" != "$port" && "$recorded_port_in_use" -eq 1 ]]; then
      verify_listener_tree_ownership "$recorded_pid" "$recorded_port"
    fi

    log "Stopping verified managed backend process tree $recorded_pid from recorded port $recorded_port"
    if ! kill -TERM -- "-$recorded_pgid"; then
      fail "Could not stop managed backend process group $recorded_pgid."
    fi
    if ! wait_for_process_to_exit "$recorded_pid"; then
      fail "Managed backend process $recorded_pid did not exit after SIGTERM."
    fi
    if [[ "$recorded_port" != "$port" ]] && ! wait_for_port_to_close "$recorded_port"; then
      fail "Managed backend process tree did not release its recorded port $recorded_port."
    fi
  else
    if [[ "$port_in_use" -eq 1 ]]; then
      fail "Port $port is occupied and $pid_file contains an untrusted owner record."
    fi
    if [[ "$state" =~ ^[0-9]+$ ]] && kill -0 "$state" 2>/dev/null; then
      fail "The legacy PID owner record cannot be verified safely; stop PID $state explicitly once."
    fi
    if [[ "$state" == launchctl:* ]] && command_exists launchctl && launchctl list "${state#launchctl:}" >/dev/null 2>&1; then
      fail "The legacy launch-service owner record cannot be verified safely; remove ${state#launchctl:} explicitly once."
    fi
    rm -f "$pid_file"
    return 0
  fi

  if ! wait_for_port_to_close "$port"; then
    fail "Managed backend did not release port $port; refusing to replace an unknown listener."
  fi
  rm -f "$pid_file"
}

shell_quote() {
  printf '%q' "$1"
}

start_backend_server() {
  local backend_dir="$1"
  local pm="$2"
  local port="$3"
  local database_url="$4"

  local pid_file="$backend_dir/.mvp-site-dev.pid"
  local log_file="$backend_dir/.mvp-site-dev.log"
  local command_parts=()
  local pm_executable
  pm_executable="$(command -v "$pm")" || fail "$pm was not found while preparing the backend server command."
  case "$pm" in
    npm)
      command_parts=("$pm_executable" run dev:plain)
      ;;
    pnpm)
      command_parts=("$pm_executable" run dev:plain)
      ;;
    yarn)
      command_parts=("$pm_executable" run dev:plain)
      ;;
    *)
      fail "Unsupported package manager $pm."
      ;;
  esac

  local quoted_backend quoted_log quoted_path quoted_port quoted_database_url quoted_command=""
  quoted_backend="$(shell_quote "$backend_dir")"
  quoted_log="$(shell_quote "$log_file")"
  quoted_path="$(shell_quote "$PATH")"
  quoted_port="$(shell_quote "$port")"
  quoted_database_url="$(shell_quote "$database_url")"
  local command_part
  for command_part in "${command_parts[@]}"; do
    quoted_command+=" $(shell_quote "$command_part")"
  done
  local command="cd $quoted_backend && exec env PATH=$quoted_path PORT=$quoted_port DATABASE_URL=$quoted_database_url DATABASE_URL_LIVE=$quoted_database_url$quoted_command >>$quoted_log 2>&1"

  log "Starting backend server on port $port"
  if command_exists launchctl; then
    local launch_label="com.razumly.mvp-site-dev-$port"
    launchctl submit -l "$launch_label" -- /bin/bash -lc "$command"
    local launch_pid="" launch_fingerprint=""
    local attempt
    for attempt in {1..30}; do
      launch_pid="$(launchctl_service_pid "$launch_label" || true)"
      if [[ -n "$launch_pid" ]] && launch_fingerprint="$(process_start_fingerprint "$launch_pid")"; then
        break
      fi
      sleep 0.1
    done
    if [[ -z "$launch_pid" || -z "$launch_fingerprint" ]]; then
      launchctl remove "$launch_label" >/dev/null 2>&1 || true
      fail "Could not capture the managed launch service process identity."
    fi
    if ! write_managed_state "$pid_file" "launchctl:$launch_label:$launch_pid:$launch_fingerprint"; then
      launchctl remove "$launch_label" >/dev/null 2>&1 || true
      fail "Could not persist the managed launch service owner record."
    fi
    return 0
  fi

  if command_exists setsid; then
    setsid /bin/bash -lc "$command" </dev/null >/dev/null 2>&1 &
    local process_pid=$!
    local process_fingerprint process_pgid
    process_fingerprint="$(process_start_fingerprint "$process_pid")" || {
      kill -TERM "$process_pid" 2>/dev/null || true
      fail "Could not capture the managed backend process identity."
    }
    local attempt
    process_pgid=""
    for attempt in {1..30}; do
      process_pgid="$(ps -o pgid= -p "$process_pid" 2>/dev/null || true)"
      process_pgid="${process_pgid//[[:space:]]/}"
      [[ "$process_pgid" == "$process_pid" ]] && break
      sleep 0.1
    done
    if [[ "$process_pgid" != "$process_pid" ]]; then
      kill -TERM "$process_pid" 2>/dev/null || true
      fail "setsid did not create an isolated backend process group."
    fi
    if ! write_managed_state "$pid_file" "process:$process_pid:$process_fingerprint:$process_pgid:$port"; then
      kill -TERM -- "-$process_pgid" 2>/dev/null || true
      fail "Could not persist the managed backend process owner record."
    fi
    return 0
  fi

  fail "A safe backend process supervisor is unavailable; install setsid or use macOS launchctl."
}

readiness_url() {
  local port="$1"
  printf 'http://127.0.0.1:%s/api/app-version?platform=ANDROID&versionName=0.0.0&buildNumber=0\n' "$port"
}

validate_readiness_payload() {
  node -e '
    let body = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        process.exit(1);
      }
      const owns = (key) => Object.prototype.hasOwnProperty.call(payload, key);
      const releaseIsValid = (release) => release !== null
        && typeof release === "object"
        && (release.platform === "ANDROID" || release.platform === "IOS")
        && typeof release.versionName === "string"
        && Number.isInteger(release.buildNumber);
      const valid = payload !== null
        && typeof payload === "object"
        && owns("updateAvailable")
        && typeof payload.updateAvailable === "boolean"
        && owns("updateRequired")
        && typeof payload.updateRequired === "boolean"
        && owns("latestVersion")
        && (payload.latestVersion === null || releaseIsValid(payload.latestVersion))
        && owns("releases")
        && Array.isArray(payload.releases)
        && payload.releases.every(releaseIsValid);
      process.exit(valid ? 0 : 1);
    });
  '
}

probe_backend_readiness() {
  local port="$1"
  local payload
  payload="$(curl -fsS --max-time 3 "$(readiness_url "$port")" 2>/dev/null)" || return 1
  printf '%s' "$payload" | validate_readiness_payload
}

wait_for_backend_readiness() {
  local port="$1"
  local timeout="${MVP_BACKEND_READY_TIMEOUT_SECONDS:-90}"
  local poll_interval="${MVP_BACKEND_POLL_INTERVAL_SECONDS:-1}"
  local i

  for ((i = 0; i < timeout; i++)); do
    if probe_backend_readiness "$port"; then
      return 0
    fi
    sleep "$poll_interval"
  done

  return 1
}

main() {
  configure_node_path

  local backend_dir
  backend_dir="$(resolve_backend_dir)" || fail "Could not find mvp-site. Set MVP_SITE_DIR or place it beside mvp-app, under ~/Documents/Code, ~/Projects/MVP, or ~/StudioProjects."

  local port
  port="$(resolve_backend_port)"

  acquire_bootstrap_lock "$backend_dir"

  local package_manager_info pm lockfile pm_version
  package_manager_info="$(detect_package_manager "$backend_dir")"
  IFS='|' read -r pm lockfile <<< "$package_manager_info"
  pm_version="$(package_manager_version "$backend_dir" "$pm")"
  enforce_declared_package_manager "$backend_dir" "$pm" "$pm_version"

  stop_managed_backend_or_fail "$backend_dir" "$port"
  ensure_database "$backend_dir"
  if ! wait_for_database "$backend_dir"; then
    fail "Postgres failed to become ready before the migration deadline."
  fi

  local database_url
  database_url="$(derive_compose_database_url "$backend_dir")" || fail "Could not derive the loopback Compose database URL."

  ensure_backend_dependencies "$backend_dir" "$pm" "$lockfile" "$pm_version" "$database_url"

  log "Applying tracked mvp-site migrations"
  run_package_script "$backend_dir" "$pm" "migrate:deploy" "$database_url"

  start_backend_server "$backend_dir" "$pm" "$port" "$database_url"
  if ! wait_for_backend_readiness "$port"; then
    if [[ -f "$backend_dir/.mvp-site-dev.log" ]]; then
      tail -n 60 "$backend_dir/.mvp-site-dev.log" >&2 || true
    fi
    stop_managed_backend_or_fail "$backend_dir" "$port"
    fail "Backend failed the database-backed readiness check at $(readiness_url "$port")"
  fi
  verify_managed_backend_listener_or_fail "$backend_dir" "$port"

  log "Backend ready at http://localhost:$port"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
