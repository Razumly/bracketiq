#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ADB="$SDK_DIR/platform-tools/adb"
EMULATOR="$SDK_DIR/emulator/emulator"
AVD_NAME="${ANDROID_AVD_NAME:-Pixel_9_Pro_API_35}"
SERIAL="${ANDROID_SERIAL:-emulator-5554}"
PACKAGE_NAME="${ANDROID_PACKAGE_NAME:-com.razumly.mvp}"
export PATH="$SDK_DIR/platform-tools:$SDK_DIR/emulator:$PATH"

if [[ ! -x "$ADB" ]]; then
  echo "adb not found at $ADB" >&2
  exit 1
fi

command="${1:-help}"

start_emulator() {
  if "$ADB" -s "$SERIAL" get-state >/dev/null 2>&1; then
    echo "$SERIAL is already connected."
    return
  fi

  if [[ ! -x "$EMULATOR" ]]; then
    echo "emulator not found at $EMULATOR" >&2
    exit 1
  fi

  nohup "$EMULATOR" -avd "$AVD_NAME" -netdelay none -netspeed full >/tmp/mvp-app-emulator.log 2>&1 &
  "$ADB" wait-for-device
  "$ADB" -s "$SERIAL" shell 'while [[ "$(getprop sys.boot_completed)" != "1" ]]; do sleep 1; done'
}

launch_app() {
  activity="$("$ADB" -s "$SERIAL" shell cmd package resolve-activity --brief "$PACKAGE_NAME" | tail -n 1 | tr -d '\r')"
  if [[ -z "$activity" || "$activity" == *"No activity found"* ]]; then
    echo "Unable to resolve launch activity for $PACKAGE_NAME" >&2
    exit 1
  fi
  "$ADB" -s "$SERIAL" shell am start -n "$activity"
}

case "$command" in
  start)
    start_emulator
    ;;
  install)
    start_emulator
    (cd "$ROOT_DIR" && ./gradlew :composeApp:installDebug --console=plain)
    ;;
  launch)
    start_emulator
    launch_app
    ;;
  reinstall)
    start_emulator
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
  start       Start/connect to the default emulator.
  install     Build and install composeApp debug.
  launch      Launch the installed app.
  reinstall   Build, install, and launch composeApp debug.
  screenshot  Save a screenshot. Optional path argument.
  ui          Dump the current UI tree.

Environment:
  ANDROID_AVD_NAME       Default: Pixel_9_Pro_API_35
  ANDROID_SERIAL         Default: emulator-5554
  ANDROID_PACKAGE_NAME   Default: com.razumly.mvp
USAGE
    ;;
esac
