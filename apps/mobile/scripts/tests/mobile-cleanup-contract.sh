#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_build="$repo_root/composeApp/build.gradle.kts"
wear_build="$repo_root/wearApp/build.gradle.kts"
catalog="$repo_root/gradle/libs.versions.toml"
gradle_properties="$repo_root/gradle.properties"
purge_script="$repo_root/scripts/purge-mobile-tournament-test-run.mjs"
event_editor_receipt_purge_script="$repo_root/scripts/purge-mobile-event-editor-receipts.mjs"

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
if [[ ! -f "$purge_script" ]]; then
  echo "Missing mobile Tournament purge helper: ${purge_script#"$repo_root"/}" >&2
  exit 1
fi
if [[ ! -f "$event_editor_receipt_purge_script" ]]; then
  echo "Missing mobile Event Editor receipt purge helper: ${event_editor_receipt_purge_script#"$repo_root"/}" >&2
  exit 1
fi
require_line "$event_editor_receipt_purge_script" "assert(LOOPBACK_HOSTS.has((url.hostname || '').toLowerCase()), 'MVP_TEST_DATABASE_URL must use a loopback host');"
require_line "$event_editor_receipt_purge_script" "assert(!FORBIDDEN_DATABASE_NAME.test(databaseName), 'MVP_TEST_DATABASE_URL must not target a production database');"
require_line "$event_editor_receipt_purge_script" "await client.query('BEGIN');"
require_line "$event_editor_receipt_purge_script" "await client.query('COMMIT');"
require_line "$event_editor_receipt_purge_script" "if (transactionOpen) await client.query('ROLLBACK');"
require_line "$event_editor_receipt_purge_script" 'WHERE "createOperationId" = $1 AND "eventId" = $2'
require_line "$event_editor_receipt_purge_script" 'WHERE "createOperationId" = $1 OR "eventId" = $2'
require_line "$event_editor_receipt_purge_script" 'const RECEIPT_SETTLE_ATTEMPTS = 60;'
require_line "$event_editor_receipt_purge_script" 'const RECEIPT_SETTLE_DELAY_MS = 100;'
require_line "$event_editor_receipt_purge_script" 'const resolveOperationReceipts = async (client, request) => {'
require_line "$event_editor_receipt_purge_script" 'const unresolvedOperationIds = (request, operationRows) => {'
require_line "$event_editor_receipt_purge_script" 'Dispatched create receipts did not settle before cleanup:'
require_line "$repo_root/composeApp/src/androidUnitTest/kotlin/com/razumly/mvp/testing/MobileApiIntegrationSupport.kt" 'put("createDispatchStarted", prepared.createDispatchStarted)'
require_line "$repo_root/composeApp/src/androidUnitTest/kotlin/com/razumly/mvp/testing/MobileApiIntegrationSupport.kt" 'put("createDispatchTerminal", prepared.createDispatchTerminal)'
require_line "$event_editor_receipt_purge_script" 'residualRows.length === 0'
require_line "$repo_root/composeApp/src/androidUnitTest/kotlin/com/razumly/mvp/testing/MobileApiIntegrationSupport.kt" 'internal fun MobileApiTestSession.purgeMobileEventEditorReceipts('
require_line "$repo_root/composeApp/src/androidUnitTest/kotlin/com/razumly/mvp/eventDetail/EventLifecycleMobileApiIntegrationTest.kt" 'host?.purgeMobileEventEditorReceipts('
require_line "$purge_script" "assert(LOOPBACK_HOSTS.has((url.hostname || '').toLowerCase()), 'MVP_TEST_DATABASE_URL must use a loopback host');"
require_line "$purge_script" "assert(!FORBIDDEN_DATABASE_NAME.test(databaseName), 'MVP_TEST_DATABASE_URL must not target a production database');"
require_line "$purge_script" "assert(['1', 'true', 'yes'].includes((process.env.MVP_TEST_DISABLE_OUTBOUND_PROVIDERS ?? '').trim().toLowerCase()), 'MVP_TEST_DISABLE_OUTBOUND_PROVIDERS=1 is required');"
require_line "$purge_script" "await client.query('BEGIN');"
require_line "$purge_script" "await client.query('COMMIT');"
require_line "$purge_script" "if (transactionOpen) await client.query('ROLLBACK');"
require_line "$purge_script" 'assert(receipt, `Create operation ${operation.createOperationId} has no receipt for resolved event id`);'
require_line "$purge_script" 'assert(operation.resolvedEventId === receipt.eventid, `Create operation ${operation.createOperationId} resolved to an unexpected event id`);'
require_line "$purge_script" 'assert(trustedEventIds.has(eventId) || DRAFT_EVENT_ID_PATTERN.test(eventId), `Event ${eventId} is not tied to a prepared Tournament create operation`);'
require_line "$purge_script" 'const createDispatchStarted = operation.createDispatchStarted;'
require_line "$purge_script" 'const createDispatchTerminal = operation.createDispatchTerminal;'
require_line "$purge_script" 'const acceptanceDispatchStarted = operation.acceptanceDispatchStarted;'
require_line "$purge_script" 'const acceptanceDispatchTerminal = operation.acceptanceDispatchTerminal;'
require_line "$purge_script" 'assert(typeof createDispatchStarted === '\''boolean'\'', `operations[${index}].createDispatchStarted must be a boolean`);'
require_line "$purge_script" 'assert(typeof createDispatchTerminal === '\''boolean'\'', `operations[${index}].createDispatchTerminal must be a boolean`);'
require_line "$purge_script" 'assert(typeof acceptanceDispatchStarted === '\''boolean'\'', `operations[${index}].acceptanceDispatchStarted must be a boolean`);'
require_line "$purge_script" 'assert(typeof acceptanceDispatchTerminal === '\''boolean'\'', `operations[${index}].acceptanceDispatchTerminal must be a boolean`);'
require_line "$purge_script" 'assert(!createDispatchTerminal || createDispatchStarted, `operations[${index}] cannot complete create before dispatch`);'
require_line "$purge_script" 'assert(!acceptanceDispatchStarted || (createDispatchStarted && !createDispatchTerminal), `operations[${index}] cannot dispatch acceptance before a non-terminal create`);'
require_line "$purge_script" 'assert(!acceptanceDispatchTerminal || acceptanceDispatchStarted, `operations[${index}] cannot complete acceptance before dispatch`);'
require_line "$purge_script" 'const RECEIPT_SETTLE_ATTEMPTS = 360;'
require_line "$purge_script" 'const RECEIPT_SETTLE_DELAY_MS = 100;'
require_line "$purge_script" 'await new Promise((resolve) => setTimeout(resolve, RECEIPT_SETTLE_DELAY_MS));'
require_line "$purge_script" 'const unresolved = unresolvedOperationIds(request, operationResult.rows);'
require_line "$purge_script" 'assert(unresolved.length === 0, `Dispatched create or acceptance operation receipts did not settle before cleanup: ${unresolved.join(", ")}`);'
require_line "$purge_script" 'const isSettledReceipt = (receipt, operation) => {'
require_line "$purge_script" 'receipt.proposaljson !== null'
require_line "$purge_script" '&& receipt.emaildelivery === '\''PROPOSED'\'''
require_line "$purge_script" 'const terminalOutcome = operation.createDispatchTerminal || operation.acceptanceDispatchTerminal;'
require_line "$purge_script" 'return (operation.createDispatchStarted && !receipt && !terminalOutcome)'
require_line "$purge_script" 'const receiptOperationIds = operationResult.rows.map((row) => row.id);'
require_line "$purge_script" 'WHERE "createOperationId" = ANY($1::text[])`, [receiptOperationIds])'
require_line "$purge_script" 'SELECT to_jsonb(t) AS row FROM "EventTeams" t WHERE "id" = ANY($1::text[])'
require_line "$purge_script" 'SELECT to_jsonb(g) AS row FROM "ChatGroup" g'
forbidden_text 'SELECT to_jsonb(t) AS row FROM "Teams" t WHERE "id" = ANY($1::text[])' "$purge_script"
require_line "$repo_root/composeApp/src/androidUnitTest/kotlin/com/razumly/mvp/testing/MobileApiIntegrationSupport.kt" 'put("createDispatchStarted", prepared.createDispatchStarted)'
require_line "$repo_root/composeApp/src/androidUnitTest/kotlin/com/razumly/mvp/testing/MobileApiIntegrationSupport.kt" 'put("acceptanceDispatchStarted", prepared.acceptanceDispatchStarted)'
require_line "$repo_root/composeApp/src/androidUnitTest/kotlin/com/razumly/mvp/testing/MobileApiIntegrationSupport.kt" 'prepared.acceptanceDispatchStarted = true'
require_line "$repo_root/composeApp/src/androidUnitTest/kotlin/com/razumly/mvp/eventDetail/EventLifecycleMobileApiIntegrationTest.kt" 'val teamIds = runOwnedTournamentTeamIds(eventId)'
behavior_test="$repo_root/scripts/tests/mobile-cleanup-behavior.mjs"
if [[ ! -x "$behavior_test" ]]; then
  echo "Missing executable mobile cleanup behavior test: ${behavior_test#"$repo_root"/}" >&2
  exit 1
fi
node "$behavior_test"

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
require_line "$gradle_properties" 'kotlin.native.jvmArgs=-Xmx8g -XX:MaxMetaspaceSize=1g'
require_line "$gradle_properties" 'org.gradle.jvmargs=-Xmx8g -Dfile.encoding=UTF-8 -Djava.awt.headless=true -XX:MaxMetaspaceSize=1g'
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
  'composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/Routes.kt'
  'core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/BillDTO.kt'
  'core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/EventDTO.kt'
  'core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/InviteDTO.kt'
  'core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/ProductDTO.kt'
  'core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/SensitiveUserDataDTO.kt'
  'core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/SubscriptionDTO.kt'
  'core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/TeamDTO.kt'
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
  requestSetConfirmation confirmSet EventDTO TeamDTO SubscriptionDTO SensitiveUserDataDTO \
  ProductDTO InviteDTO BillDTO BillPaymentDTO toEventDTO toTeamDTO \
  upsertEventWithRelations createFields HomeRoute LoginRoute EventListRoute FollowingRoute \
  CreateRoute ProfileRoute MatchDetailRoute; do
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
  'onConfirmResult = component::completeCurrentSet'

echo "Mobile build/dead-code cleanup contract passed"
