#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_build="$repo_root/composeApp/build.gradle.kts"
wear_build="$repo_root/wearApp/build.gradle.kts"
catalog="$repo_root/gradle/libs.versions.toml"
gradle_properties="$repo_root/gradle.properties"

require_line() {
  local file="$1"
  local needle="$2"
  if ! rg --fixed-strings --quiet -- "$needle" "$file"; then
    echo "Missing mobile cleanup contract in ${file#"$repo_root"/}: $needle" >&2
    exit 1
  fi
}

forbidden_text() {
  local needle="$1"
  shift
  if rg --fixed-strings --quiet -- "$needle" "$@"; then
    echo "Forbidden mobile cleanup regression: $needle" >&2
    exit 1
  fi
}

require_line "$catalog" 'compose-multiplatform = "1.11.1"'
require_line "$catalog" 'androidxCompose = "1.11.3"'
for version_key in componentsResourcesVersion foundation foundationLayout material runtimeSaveable uiVersion animationAndroid androidxComposeUiTest; do
  if sed -n '/^\[versions\]/,/^\[libraries\]/p' "$catalog" |
    rg --regexp "^${version_key}[[:space:]]*=" --quiet; then
    echo "Compose version $version_key must use the shared catalog version." >&2
    exit 1
  fi
done

if [[ "$(rg --fixed-strings --count-matches -- 'implementation(libs.coil.compose)' "$compose_build")" -ne 1 ]]; then
  echo "composeApp must declare libs.coil.compose exactly once." >&2
  exit 1
fi

for coordinate in \
  'com.google.auth:google-auth-library-oauth2-http' \
  'com.google.http-client:google-http-client-gson' \
  'com.google.apis:google-api-services-oauth2'; do
  forbidden_text "$coordinate" "$compose_build" "$catalog"
done
forbidden_text 'id("com.google.gms.google-services") version' "$compose_build"
forbidden_text 'id("co.touchlab.skie") version' "$compose_build"
require_line "$compose_build" 'alias(libs.plugins.google.services) apply false'
require_line "$compose_build" 'alias(libs.plugins.skie)'

if rg --regexp 'pickFirsts.*\*' --quiet "$compose_build" "$wear_build"; then
  echo "Wildcard resource pick-first rules are forbidden." >&2
  exit 1
fi
forbidden_text 'enableSplit = false' "$compose_build" "$wear_build"
require_line "$compose_build" 'providers.gradleProperty("compose.includeSourceInformation")'
require_line "$compose_build" '.orElse(false)'
require_line "$gradle_properties" 'kotlin.daemon.jvmargs=-Xmx4g'
require_line "$gradle_properties" 'kotlin.native.jvmArgs=-Xmx4g -XX:MaxMetaspaceSize=1g'
require_line "$gradle_properties" 'org.gradle.jvmargs=-Xmx4g -Dfile.encoding=UTF-8 -Djava.awt.headless=true -XX:MaxMetaspaceSize=1g'
require_line "$gradle_properties" 'android.r8.strictFullModeForKeepRules=true'
require_line "$gradle_properties" 'android.r8.optimizedResourceShrinking=true'

require_line "$compose_build" 'val generateLogoVectors by tasks.registering'
require_line "$compose_build" 'val verifyLogoVectors by tasks.registering'
require_line "$compose_build" 'src/androidMain/res/drawable/ic_launcher_foreground.xml'
require_line "$compose_build" 'src/androidMain/res/drawable/ic_notification_logo.xml'
require_line "$compose_build" 'src/commonMain/composeResources/drawable/mvp_logo_white_bg.xml'
require_line "$compose_build" 'dependsOn(verifyLogoVectors)'
require_line "$repo_root/composeApp/src/commonMain/composeResources/drawable/mvp_logo.xml" \
  'Canonical BracketIQ logo geometry'

deleted_paths=(
  '.tmp_mojibake_team_search.sql'
  '.tmp_placeholder_team_search.sql'
  '.tmp_placeholder_team_search2.sql'
  'composeApp/src/androidMain/kotlin/com/razumly/mvp/core/BuildConfigImpl.kt'
  'composeApp/src/commonMain/composeResources/drawable/baseline_visibility_24.xml'
  'composeApp/src/commonMain/composeResources/drawable/baseline_visibility_off_24.xml'
  'composeApp/src/commonMain/composeResources/drawable/compose-multiplatform.xml'
  'composeApp/src/commonMain/composeResources/drawable/ic_beach.xml'
  'composeApp/src/commonMain/composeResources/drawable/ic_google.xml'
  'composeApp/src/commonMain/composeResources/drawable/ic_grass.xml'
  'composeApp/src/commonMain/composeResources/drawable/ic_groups.xml'
  'composeApp/src/commonMain/composeResources/drawable/ic_indoor.xml'
  'composeApp/src/commonMain/composeResources/drawable/ic_tournament.xml'
  'composeApp/src/commonMain/composeResources/drawable/remove_24px.xml'
  'composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/composables/StylizedText.kt'
  'composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/util/TextPatterns.kt'
  'composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/Header.kt'
  'composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/TeamSizeLimitDropdown.kt'
  'composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/MultiSelectDropdownField.kt'
  'composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/CollapsableHeader.kt'
  'composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/SetCountDropdown.kt'
  'composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/MatchEditControls.kt'
  'composeApp/src/commonMain/kotlin/com/razumly/mvp/core/util/DecimalFormat.kt'
  'composeApp/src/androidMain/kotlin/com/razumly/mvp/core/util/DecimalFormat.android.kt'
  'composeApp/src/iosMain/kotlin/com/razumly/mvp/core/util/DecimalFormat.ios.kt'
  'composeApp/src/androidMain/kotlin/com/razumly/mvp/userAuth/util/GetGoogleUserInfo.kt'
  'composeApp/src/iosMain/kotlin/com/razumly/mvp/userAuth/util/GetGoogleUserInfo.kt'
  'core/ui/src/commonMain/kotlin/com/razumly/mvp/core/presentation/Color.kt'
  'core/ui/src/commonMain/kotlin/com/razumly/mvp/core/presentation/Type.kt'
  'core/ui/src/commonMain/kotlin/com/razumly/mvp/icons/ArrowDown.kt'
  'core/ui/src/commonMain/kotlin/com/razumly/mvp/icons/ArrowUp.kt'
  'core/ui/src/commonMain/kotlin/com/razumly/mvp/icons/BaselineVisibility24.kt'
  'core/ui/src/commonMain/kotlin/com/razumly/mvp/icons/BaselineVisibilityOff24.kt'
  'core/ui/src/commonMain/kotlin/com/razumly/mvp/icons/ComposeMultiplatform.kt'
  'core/ui/src/commonMain/kotlin/com/razumly/mvp/icons/Volleyball.kt'
  'core/ui/src/commonMain/kotlin/com/razumly/mvp/icons/VolleyballPlayer.kt'
)
for relative_path in "${deleted_paths[@]}"; do
  if [[ -e "$repo_root/$relative_path" ]]; then
    echo "Obsolete production artifact still exists: $relative_path" >&2
    exit 1
  fi
done

for symbol in DbConstants AnimatedMarkerContent MaterialMarker StylizedText TextPatterns \
  BuildConfigImpl DecimalFormat getGoogleUserInfo setRadius toMoko AppTypography \
  AppExtendedColors LocalAppExtendedColors appExtendedColors displayValueToCents \
  AvatarFallbackColors LightAppExtendedColors DarkAppExtendedColors isLightTheme \
  ScheduleMode ScheduleEntry MonthDatePicker WeekDatePicker DayDatePicker CalendarTitle \
  CalendarNavigationButton CalendarDayCell WeekHeader showSetConfirmDialog dismissSetDialog \
  requestSetConfirmation confirmSet; do
  if rg --word-regexp --quiet --glob '*.kt' -- "$symbol" "$repo_root/composeApp/src" "$repo_root/core"; then
    echo "Definition-only symbol still exists: $symbol" >&2
    exit 1
  fi
done

strings_file="$repo_root/composeApp/src/commonMain/composeResources/values/strings.xml"
if [[ "$(rg --count-matches -- '<string ' "$strings_file")" -ne 7 ]]; then
  echo "Shared string resources must contain only the seven generated-resource consumers." >&2
  exit 1
fi
forbidden_text '</string>"' "$strings_file"
forbidden_text 'fun formatCurrency' \
  "$repo_root/core/ui/src/commonMain/kotlin/com/razumly/mvp/core/presentation/util/MoneyUtils.kt"
forbidden_text 'formatDoubleToCurrency' \
  "$repo_root/core/ui/src/commonMain/kotlin/com/razumly/mvp/core/presentation/util/MoneyUtils.kt"
forbidden_text 'val fontSize = when' \
  "$repo_root/core/ui/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/EmailSignInButton.kt"
require_line \
  "$repo_root/composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt" \
  'fun completeCurrentSet()'
require_line \
  "$repo_root/composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchDetailScreen.kt" \
  'component.completeCurrentSet()'

echo "Mobile build/dead-code cleanup contract passed"
