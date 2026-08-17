#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

resolve_android_sdk_dir() {
  if [[ -n "${ANDROID_HOME:-}" ]]; then
    printf '%s\n' "$ANDROID_HOME"
    return 0
  fi
  if [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
    printf '%s\n' "$ANDROID_SDK_ROOT"
    return 0
  fi

  local candidate
  for candidate in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    if [[ -d "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  local adb_on_path
  adb_on_path="$(command -v adb 2>/dev/null || true)"
  if [[ -n "$adb_on_path" ]]; then
    (cd "$(dirname "$adb_on_path")/.." && pwd)
    return 0
  fi

  if [[ "$(uname -s 2>/dev/null || true)" == "Darwin" ]]; then
    printf '%s\n' "$HOME/Library/Android/sdk"
  else
    printf '%s\n' "$HOME/Android/Sdk"
  fi
}

SDK_DIR="$(resolve_android_sdk_dir)"
ADB="$SDK_DIR/platform-tools/adb"
EMULATOR="$SDK_DIR/emulator/emulator"
SERIAL="${ANDROID_SERIAL:-emulator-5554}"
PACKAGE_NAME="${ANDROID_PACKAGE_NAME:-com.razumly.mvp}"
export ANDROID_HOME="$SDK_DIR"
export PATH="$SDK_DIR/platform-tools:$SDK_DIR/emulator:$PATH"

fail() {
  echo "$*" >&2
  exit 1
}

require_adb() {
  if [[ ! -x "$ADB" ]]; then
    fail "adb not found at $ADB. Set ANDROID_HOME or ANDROID_SDK_ROOT to an installed Android SDK."
  fi
}

require_emulator() {
  if [[ ! -x "$EMULATOR" ]]; then
    fail "emulator not found at $EMULATOR. Set ANDROID_HOME or ANDROID_SDK_ROOT to an installed Android SDK."
  fi
}

resolve_avd_name() {
  if [[ -n "${ANDROID_AVD_NAME:-}" ]]; then
    printf '%s\n' "$ANDROID_AVD_NAME"
    return 0
  fi

  require_emulator

  local avd_list
  if ! avd_list="$("$EMULATOR" -list-avds)"; then
    fail "Unable to list installed Android virtual devices with $EMULATOR."
  fi

  local discovered_avd
  discovered_avd="$(printf '%s\n' "$avd_list" | tr -d '\r' | awk 'NF { print; exit }')"
  if [[ -z "$discovered_avd" ]]; then
    fail "No Android virtual devices are installed. Create an AVD or set ANDROID_AVD_NAME explicitly."
  fi

  printf '%s\n' "$discovered_avd"
}

verify_gradle_daemon_jvm() {
  "$ROOT_DIR/scripts/tests/gradle-daemon-jvm-contract.sh"
}

command="${1:-help}"

start_emulator() {
  require_adb

  if "$ADB" -s "$SERIAL" get-state >/dev/null 2>&1; then
    echo "$SERIAL is already connected."
    return
  fi

  require_emulator

  local avd_name
  avd_name="$(resolve_avd_name)"

  echo "Starting Android virtual device $avd_name."
  nohup "$EMULATOR" -avd "$avd_name" -netdelay none -netspeed full >/tmp/mvp-app-emulator.log 2>&1 &
  "$ADB" wait-for-device
  "$ADB" -s "$SERIAL" shell 'while [[ "$(getprop sys.boot_completed)" != "1" ]]; do sleep 1; done'
}

launch_app() {
  require_adb
  activity="$("$ADB" -s "$SERIAL" shell cmd package resolve-activity --brief "$PACKAGE_NAME" | tail -n 1 | tr -d '\r')"
  if [[ -z "$activity" || "$activity" == *"No activity found"* ]]; then
    echo "Unable to resolve launch activity for $PACKAGE_NAME" >&2
    exit 1
  fi
  "$ADB" -s "$SERIAL" shell am start -n "$activity"
}

case "$command" in
  avd)
    resolve_avd_name
    ;;
  start)
    start_emulator
    ;;
  install)
    start_emulator
    verify_gradle_daemon_jvm
    (cd "$ROOT_DIR" && ./gradlew :composeApp:installDebug --console=plain)
    ;;
  launch)
    start_emulator
    launch_app
    ;;
  reinstall)
    start_emulator
    verify_gradle_daemon_jvm
    (cd "$ROOT_DIR" && ./gradlew :composeApp:installDebug --console=plain)
    launch_app
    ;;
  screenshot)
    start_emulator
    output="${2:-/tmp/mvp-app-emulator.png}"
    "$ADB" -s "$SERIAL" exec-out screencap -p > "$output"
    echo "$output"
    ;;
  ui)
    start_emulator
    "$ADB" -s "$SERIAL" exec-out uiautomator dump /dev/tty
    ;;
  *)
    cat <<USAGE
Usage: scripts/android-emulator-dev.sh <command>

Commands:
  avd         Print the configured AVD, or the first installed AVD when unset.
  start       Start/connect to the default emulator.
  install     Build and install composeApp debug.
  launch      Launch the installed app.
  reinstall   Build, install, and launch composeApp debug.
  screenshot  Save a screenshot. Optional path argument.
  ui          Dump the current UI tree.

Environment:
  ANDROID_AVD_NAME       Optional explicit AVD; otherwise the first installed AVD is used.
  ANDROID_SERIAL         Default: emulator-5554
  ANDROID_PACKAGE_NAME   Default: com.razumly.mvp
  ANDROID_HOME           Optional Android SDK path (preferred over discovery).
  ANDROID_SDK_ROOT       Optional Android SDK path when ANDROID_HOME is unset.
USAGE
    ;;
esac
