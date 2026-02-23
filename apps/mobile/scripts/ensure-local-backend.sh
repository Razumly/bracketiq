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
  if [[ "$base_url" =~ ^https?://[^:/]+:([0-9]+) ]]; then
    echo "${BASH_REMATCH[1]}"
  else
    echo "3000"
  fi
}

resolve_backend_port() {
  local base_url
  base_url="$(get_property "$REPO_ROOT/secrets.properties" "MVP_API_BASE_URL" || true)"
  if [[ -z "$base_url" ]]; then
    base_url="$(get_property "$REPO_ROOT/local.defaults.properties" "MVP_API_BASE_URL" || true)"
  fi
  if [[ -z "$base_url" ]]; then
    echo "3000"
    return 0
  fi
  extract_port "$base_url"
}

configure_node_path() {
  if [[ -x "/opt/homebrew/opt/node@22/bin/node" ]]; then
    export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
    return 0
  fi
  if [[ -x "/usr/local/opt/node@22/bin/node" ]]; then
    export PATH="/usr/local/opt/node@22/bin:$PATH"
    return 0
  fi
}

detect_package_manager() {
  local backend_dir="$1"
  if [[ -f "$backend_dir/pnpm-lock.yaml" ]] && command_exists pnpm; then
    echo "pnpm"
    return 0
  fi
  if [[ -f "$backend_dir/yarn.lock" ]] && command_exists yarn; then
    echo "yarn"
    return 0
  fi
  if ! command_exists npm; then
    fail "npm was not found on PATH."
  fi
  echo "npm"
}

ensure_docker_daemon() {
  if ! command_exists docker; then
    fail "Docker is not installed."
  fi

  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if command_exists open; then
    open -a Docker >/dev/null 2>&1 || true
  fi

  local i
  for i in {1..60}; do
    if docker info >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  fail "Docker daemon is not running."
}

ensure_database() {
  local backend_dir="$1"
  ensure_docker_daemon

  if [[ -f "$backend_dir/.env.docker" ]]; then
    (cd "$backend_dir" && docker compose --env-file .env.docker up -d db >/dev/null)
  else
    (cd "$backend_dir" && docker compose up -d db >/dev/null)
  fi
}

is_server_up() {
  local port="$1"
  curl -fsS --max-time 2 "http://127.0.0.1:${port}/" >/dev/null 2>&1
}

ensure_backend_dependencies() {
  local backend_dir="$1"
  local pm="$2"

  if [[ -d "$backend_dir/node_modules" ]]; then
    return 0
  fi

  log "Installing backend dependencies in $backend_dir"
  case "$pm" in
    pnpm)
      (cd "$backend_dir" && pnpm install)
      ;;
    yarn)
      (cd "$backend_dir" && yarn install)
      ;;
    *)
      (cd "$backend_dir" && npm install)
      ;;
  esac
}

start_backend_server() {
  local backend_dir="$1"
  local pm="$2"
  local port="$3"

  local pid_file="$backend_dir/.mvp-site-dev.pid"
  local log_file="$backend_dir/.mvp-site-dev.log"
  local existing_pid=""

  if [[ -f "$pid_file" ]]; then
    existing_pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ "$existing_pid" =~ ^[0-9]+$ ]] && kill -0 "$existing_pid" 2>/dev/null; then
      return 0
    fi
    rm -f "$pid_file"
  fi

  local cmd=""
  case "$pm" in
    pnpm)
      cmd="pnpm run dev:plain"
      ;;
    yarn)
      cmd="yarn dev:plain"
      ;;
    *)
      cmd="npm run dev:plain"
      ;;
  esac

  log "Starting backend server on port $port"
  if command_exists launchctl; then
    local launch_label="com.razumly.mvp-site-dev"
    launchctl remove "$launch_label" >/dev/null 2>&1 || true
    launchctl submit -l "$launch_label" -- /bin/bash -lc "cd \"$backend_dir\" && exec env PORT=\"$port\" $cmd >>\"$log_file\" 2>&1"
    echo "launchctl:$launch_label" > "$pid_file"
    return 0
  fi

  if command_exists setsid; then
    setsid /bin/bash -lc "cd \"$backend_dir\" && exec env PORT=\"$port\" $cmd >>\"$log_file\" 2>&1" </dev/null >/dev/null 2>&1 &
    echo $! > "$pid_file"
    return 0
  fi

  (
    cd "$backend_dir"
    nohup env PORT="$port" /bin/bash -lc "$cmd" >"$log_file" 2>&1 < /dev/null &
    echo $! > "$pid_file"
  )
}

wait_for_server() {
  local port="$1"
  local timeout="${2:-90}"
  local i

  for ((i = 0; i < timeout; i++)); do
    if is_server_up "$port"; then
      return 0
    fi
    sleep 1
  done

  return 1
}

main() {
  configure_node_path

  local backend_dir
  backend_dir="$(resolve_backend_dir)" || fail "Could not find mvp-site. Set MVP_SITE_DIR or clone it to ../mvp-site."

  local port
  port="$(resolve_backend_port)"

  if is_server_up "$port"; then
    log "Backend already running on http://localhost:$port"
    return 0
  fi

  local pm
  pm="$(detect_package_manager "$backend_dir")"

  ensure_database "$backend_dir"
  ensure_backend_dependencies "$backend_dir" "$pm"
  start_backend_server "$backend_dir" "$pm" "$port"

  if ! wait_for_server "$port" 90; then
    if [[ -f "$backend_dir/.mvp-site-dev.log" ]]; then
      tail -n 60 "$backend_dir/.mvp-site-dev.log" >&2 || true
    fi
    fail "Backend failed to become reachable on http://localhost:$port"
  fi

  log "Backend ready at http://localhost:$port"
}

main "$@"
