#!/bin/sh
set -eu

if [ "${CONFIGURATION:-}" != "Release" ]; then
    exit 0
fi

fail() {
    echo "iOS Release runtime URL sanitization failed: $*" >&2
    exit 1
}

target_build_dir="${TARGET_BUILD_DIR:-}"
resources_folder="${UNLOCALIZED_RESOURCES_FOLDER_PATH:-}"
[ -n "$target_build_dir" ] || fail "TARGET_BUILD_DIR is not set"
[ -n "$resources_folder" ] || fail "UNLOCALIZED_RESOURCES_FOLDER_PATH is not set"

runtime_secrets="$target_build_dir/$resources_folder/Secrets.plist"
[ -f "$runtime_secrets" ] || fail "the copied Secrets.plist was not found"

production_url="${MVP_RELEASE_API_BASE_URL:-https://bracket-iq.com}"
production_url="${production_url%/}"
[ "$production_url" = "https://bracket-iq.com" ] ||
    fail "MVP_RELEASE_API_BASE_URL must be https://bracket-iq.com"

plist_buddy=/usr/libexec/PlistBuddy
[ -x "$plist_buddy" ] || fail "PlistBuddy was not found"

set_runtime_url() {
    key="$1"
    if "$plist_buddy" -c "Set :$key $production_url" "$runtime_secrets" >/dev/null 2>&1; then
        return
    fi
    "$plist_buddy" -c "Add :$key string $production_url" "$runtime_secrets" >/dev/null
}

set_runtime_url mvpApiBaseUrl
set_runtime_url mvpApiBaseUrlRemote
set_runtime_url mvpWebBaseUrl

if grep -Eqi 'ngrok([-.]|$)' "$runtime_secrets"; then
    fail "the copied Secrets.plist still contains an ngrok endpoint"
fi

echo "iOS Release runtime URLs use https://bracket-iq.com"
