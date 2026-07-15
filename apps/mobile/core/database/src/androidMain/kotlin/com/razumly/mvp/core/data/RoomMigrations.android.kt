package com.razumly.mvp.core.data

import androidx.room.migration.Migration
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.db.SupportSQLiteDatabase
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_LEGACY_UNKNOWN_PAYER_ID
import kotlin.use

/**
 * Migrations for every released Room schema that can reach the current database.
 *
 * These use target-table rebuilds for non-null backfills. Kotlin property defaults are not
 * SQLite defaults, so an `ALTER TABLE ... DEFAULT ...` would leave a schema that does not match
 * Room's exported target DDL. The values below are migration-only values for pre-existing rows.
 */
private data class MigrationColumn(
    val name: String,
    val affinity: String,
    val required: Boolean = false,
)

private fun column(
    name: String,
    affinity: String,
    required: Boolean = false,
): MigrationColumn = MigrationColumn(name, affinity, required)

private fun migration(
    fromVersion: Int,
    toVersion: Int,
    statements: List<String>,
): Migration = object : Migration(fromVersion, toVersion) {
    override fun migrate(db: SupportSQLiteDatabase) {
        statements.forEach(db::execSQL)
    }

    override fun migrate(connection: SQLiteConnection) {
        statements.forEach { sql ->
            connection.prepare(sql).use { statement ->
                statement.step()
            }
        }
    }
}

private fun createTableSql(
    tableName: String,
    columns: List<MigrationColumn>,
    primaryKey: List<String>,
): String {
    val columnDefinitions = columns.joinToString(", ") { column ->
        "`${column.name}` ${column.affinity}${if (column.required) " NOT NULL" else ""}"
    }
    val primaryKeyDefinition = primaryKey.joinToString(", ") { "`$it`" }
    return "CREATE TABLE `$tableName` ($columnDefinitions, PRIMARY KEY($primaryKeyDefinition))"
}

private fun rebuildTableSql(
    tableName: String,
    columns: List<MigrationColumn>,
    primaryKey: List<String>,
    backfills: Map<String, String> = emptyMap(),
    indices: List<String> = emptyList(),
): List<String> {
    val temporaryTableName = "${tableName}_migration_new"
    val targetColumns = columns.joinToString(", ") { "`${it.name}`" }
    val sourceColumns = columns.joinToString(", ") { column ->
        backfills[column.name] ?: "`${column.name}`"
    }

    return listOf(
        "DROP TABLE IF EXISTS `$temporaryTableName`",
        createTableSql(temporaryTableName, columns, primaryKey),
        "INSERT INTO `$temporaryTableName` ($targetColumns) SELECT $sourceColumns FROM `$tableName`",
        "DROP TABLE `$tableName`",
        "ALTER TABLE `$temporaryTableName` RENAME TO `$tableName`",
    ) + indices
}

private val eventV7Columns = listOf(
    column("doubleElimination", "INTEGER", required = true),
    column("winnerSetCount", "INTEGER", required = true),
    column("loserSetCount", "INTEGER", required = true),
    column("winnerBracketPointsToVictory", "TEXT", required = true),
    column("loserBracketPointsToVictory", "TEXT", required = true),
    column("prize", "TEXT", required = true),
    column("id", "TEXT", required = true),
    column("name", "TEXT", required = true),
    column("description", "TEXT", required = true),
    column("divisions", "TEXT", required = true),
    column("divisionDetails", "TEXT", required = true),
    column("location", "TEXT", required = true),
    column("address", "TEXT"),
    column("start", "INTEGER", required = true),
    column("end", "INTEGER", required = true),
    column("priceCents", "INTEGER", required = true),
    column("rating", "REAL"),
    column("imageId", "TEXT", required = true),
    column("coordinates", "TEXT", required = true),
    column("hostId", "TEXT", required = true),
    column("assistantHostIds", "TEXT", required = true),
    column("noFixedEndDateTime", "INTEGER", required = true),
    column("teamSignup", "INTEGER", required = true),
    column("singleDivision", "INTEGER", required = true),
    column("freeAgentIds", "TEXT", required = true),
    column("waitListIds", "TEXT", required = true),
    column("userIds", "TEXT", required = true),
    column("teamIds", "TEXT", required = true),
    column("cancellationRefundHours", "INTEGER", required = true),
    column("registrationCutoffHours", "INTEGER", required = true),
    column("seedColor", "INTEGER", required = true),
    column("sportId", "TEXT"),
    column("timeSlotIds", "TEXT", required = true),
    column("fieldIds", "TEXT", required = true),
    column("leagueScoringConfigId", "TEXT"),
    column("organizationId", "TEXT"),
    column("autoCancellation", "INTEGER", required = true),
    column("maxParticipants", "INTEGER", required = true),
    column("minAge", "INTEGER"),
    column("maxAge", "INTEGER"),
    column("teamSizeLimit", "INTEGER", required = true),
    column("registrationByDivisionType", "INTEGER", required = true),
    column("eventType", "TEXT", required = true),
    column("fieldCount", "INTEGER"),
    column("gamesPerOpponent", "INTEGER"),
    column("includePlayoffs", "INTEGER", required = true),
    column("playoffTeamCount", "INTEGER"),
    column("usesSets", "INTEGER", required = true),
    column("matchDurationMinutes", "INTEGER"),
    column("setDurationMinutes", "INTEGER"),
    column("setsPerMatch", "INTEGER"),
    column("doTeamsOfficiate", "INTEGER"),
    column("teamOfficialsMaySwap", "INTEGER"),
    column("restTimeMinutes", "INTEGER"),
    column("state", "TEXT", required = true),
    column("pointsToVictory", "TEXT", required = true),
    column("officialSchedulingMode", "TEXT", required = true),
    column("officialPositions", "TEXT", required = true),
    column("eventOfficials", "TEXT", required = true),
    column("officialIds", "TEXT", required = true),
    column("allowPaymentPlans", "INTEGER"),
    column("installmentCount", "INTEGER"),
    column("installmentDueDates", "TEXT", required = true),
    column("installmentAmounts", "TEXT", required = true),
    column("allowTeamSplitDefault", "INTEGER"),
    column("requiredTemplateIds", "TEXT", required = true),
    column("lastUpdated", "INTEGER", required = true),
)

private val eventV3Columns = eventV7Columns
    .filterNot {
        it.name in setOf(
            "address",
            "officialSchedulingMode",
            "officialPositions",
            "eventOfficials",
        )
    }.map { column ->
        when (column.name) {
            "doTeamsOfficiate" -> column.copy(name = "doTeamsRef")
            "teamOfficialsMaySwap" -> column.copy(name = "teamRefsMaySwap")
            "officialIds" -> column.copy(name = "refereeIds")
            else -> column
        }
    }
private val eventV4Columns = eventV3Columns.map { column ->
    when (column.name) {
        "doTeamsRef" -> column.copy(name = "doTeamsOfficiate")
        "teamRefsMaySwap" -> column.copy(name = "teamOfficialsMaySwap")
        "refereeIds" -> column.copy(name = "officialIds")
        else -> column
    }
}
private val eventV6Columns = eventV4Columns + listOf(
    column("address", "TEXT"),
    column("officialSchedulingMode", "TEXT", required = true),
    column("officialPositions", "TEXT", required = true),
    column("eventOfficials", "TEXT", required = true),
)

private val eventV12Columns = eventV7Columns +
    column("autoCreatePointMatchIncidents", "INTEGER", required = true)
private val eventV13Columns = eventV12Columns + listOf(
    column("matchRulesOverride", "TEXT"),
    column("resolvedMatchRules", "TEXT"),
)
private val eventV16Columns = eventV13Columns +
    column("installmentDueRelativeDays", "TEXT", required = true)
private val eventV18Columns = eventV16Columns.map { column ->
    if (column.name == "cancellationRefundHours") column.copy(required = false) else column
}
private val eventV19Columns = eventV18Columns +
    column("splitLeaguePlayoffDivisions", "INTEGER", required = true)
private val eventV20Columns = eventV19Columns +
    column("timeZone", "TEXT", required = true)
private val eventV28Columns = eventV20Columns + listOf(
    column("affiliateUrl", "TEXT"),
    column("registrationPaymentMode", "TEXT", required = true),
    column("manualPaymentLinks", "TEXT", required = true),
    column("manualPaymentInstructions", "TEXT"),
)
private val eventV29Columns = eventV28Columns + listOf(
    column("scheduleText", "TEXT"),
    column("dateDisplayMode", "TEXT"),
    column("dateDisplayText", "TEXT"),
    column("teamCheckInMode", "TEXT", required = true),
    column("teamCheckInOpenMinutesBefore", "INTEGER", required = true),
    column("allowMatchRosterEdits", "INTEGER", required = true),
    column("allowTemporaryMatchPlayers", "INTEGER", required = true),
)
private val eventV32Columns = eventV29Columns +
    column("tags", "TEXT", required = true)

private val teamV7Columns = listOf(
    column("division", "TEXT", required = true),
    column("name", "TEXT"),
    column("captainId", "TEXT", required = true),
    column("managerId", "TEXT"),
    column("headCoachId", "TEXT"),
    column("coachIds", "TEXT", required = true),
    column("parentTeamId", "TEXT"),
    column("playerIds", "TEXT", required = true),
    column("pending", "TEXT", required = true),
    column("teamSize", "INTEGER", required = true),
    column("profileImageId", "TEXT"),
    column("sport", "TEXT"),
    column("divisionTypeId", "TEXT"),
    column("divisionTypeName", "TEXT"),
    column("skillDivisionTypeId", "TEXT"),
    column("skillDivisionTypeName", "TEXT"),
    column("ageDivisionTypeId", "TEXT"),
    column("ageDivisionTypeName", "TEXT"),
    column("divisionGender", "TEXT"),
    column("id", "TEXT", required = true),
)

private val teamV8Columns = teamV7Columns.map { column ->
    if (column.name == "name") column.copy(required = true) else column
}
private val teamV11Columns = teamV8Columns + listOf(
    column("kind", "TEXT"),
    column("playerRegistrationIds", "TEXT", required = true),
    column("staffAssignmentIds", "TEXT", required = true),
    column("playerRegistrations", "TEXT", required = true),
    column("staffAssignments", "TEXT", required = true),
)
private val teamV14Columns = teamV11Columns + listOf(
    column("organizationId", "TEXT"),
    column("createdBy", "TEXT"),
    column("openRegistration", "INTEGER", required = true),
    column("registrationPriceCents", "INTEGER", required = true),
)
private val teamV15Columns = teamV14Columns +
    column("requiredTemplateIds", "TEXT", required = true)
private val teamV17Columns = teamV15Columns.filterNot { it.name == "divisionTypeName" }
private val teamV23Columns = teamV17Columns +
    column("joinPolicy", "TEXT", required = true)

private val userV9Columns = listOf(
    column("firstName", "TEXT", required = true),
    column("lastName", "TEXT", required = true),
    column("teamIds", "TEXT", required = true),
    column("friendIds", "TEXT", required = true),
    column("friendRequestIds", "TEXT", required = true),
    column("friendRequestSentIds", "TEXT", required = true),
    column("followingIds", "TEXT", required = true),
    column("userName", "TEXT", required = true),
    column("hasStripeAccount", "INTEGER"),
    column("uploadedImages", "TEXT", required = true),
    column("profileImageId", "TEXT"),
    column("privacyDisplayName", "TEXT"),
    column("isMinor", "INTEGER", required = true),
    column("isIdentityHidden", "INTEGER", required = true),
    column("id", "TEXT", required = true),
)
private val userV10Columns = userV9Columns + listOf(
    column("blockedUserIds", "TEXT", required = true),
    column("hiddenEventIds", "TEXT", required = true),
    column("chatTermsAcceptedAt", "TEXT"),
    column("chatTermsVersion", "TEXT"),
)
private val userV21Columns = userV10Columns +
    column("notificationSettings", "TEXT", required = true)
private val userV3Columns = userV9Columns.filterNot {
    it.name in setOf("privacyDisplayName", "isMinor", "isIdentityHidden")
}

private val registrationV9Columns = listOf(
    column("id", "TEXT", required = true),
    column("eventId", "TEXT", required = true),
    column("registrantId", "TEXT", required = true),
    column("parentId", "TEXT"),
    column("registrantType", "TEXT", required = true),
    column("rosterRole", "TEXT"),
    column("status", "TEXT"),
    column("divisionId", "TEXT"),
    column("divisionTypeId", "TEXT"),
    column("divisionTypeKey", "TEXT"),
    column("slotId", "TEXT"),
    column("occurrenceDate", "TEXT"),
    column("createdAt", "TEXT"),
    column("updatedAt", "TEXT"),
)

private val matchV11Columns = listOf(
    column("matchId", "INTEGER", required = true),
    column("team1Id", "TEXT"),
    column("team2Id", "TEXT"),
    column("team1Seed", "INTEGER"),
    column("team2Seed", "INTEGER"),
    column("eventId", "TEXT", required = true),
    column("officialId", "TEXT"),
    column("fieldId", "TEXT"),
    column("start", "INTEGER"),
    column("end", "INTEGER"),
    column("division", "TEXT"),
    column("team1Points", "TEXT", required = true),
    column("team2Points", "TEXT", required = true),
    column("setResults", "TEXT", required = true),
    column("side", "TEXT"),
    column("losersBracket", "INTEGER", required = true),
    column("winnerNextMatchId", "TEXT"),
    column("loserNextMatchId", "TEXT"),
    column("previousLeftId", "TEXT"),
    column("previousRightId", "TEXT"),
    column("officialCheckedIn", "INTEGER"),
    column("officialIds", "TEXT", required = true),
    column("teamOfficialId", "TEXT"),
    column("locked", "INTEGER", required = true),
    column("id", "TEXT", required = true),
)
private val matchV12Columns = matchV11Columns + listOf(
    column("status", "TEXT"),
    column("resultStatus", "TEXT"),
    column("resultType", "TEXT"),
    column("actualStart", "TEXT"),
    column("actualEnd", "TEXT"),
    column("statusReason", "TEXT"),
    column("winnerEventTeamId", "TEXT"),
    column("matchRulesSnapshot", "TEXT"),
    column("resolvedMatchRules", "TEXT"),
    column("segments", "TEXT", required = true),
    column("incidents", "TEXT", required = true),
)
private val matchV3Columns = matchV11Columns
    .filterNot { it.name == "officialIds" }
    .map { column ->
        when (column.name) {
            "officialId" -> column.copy(name = "refereeId")
            "officialCheckedIn" -> column.copy(name = "refereeCheckedIn")
            "teamOfficialId" -> column.copy(name = "teamRefereeId")
            else -> column
        }
    }
private val matchV4Columns = matchV3Columns.map { column ->
    when (column.name) {
        "refereeId" -> column.copy(name = "officialId")
        "refereeCheckedIn" -> column.copy(name = "officialCheckedIn")
        "teamRefereeId" -> column.copy(name = "teamOfficialId")
        else -> column
    }
}
private val matchV6Columns = matchV4Columns +
    column("officialIds", "TEXT", required = true)

private val teamComplianceV22Columns = listOf(
    column("eventId", "TEXT", required = true),
    column("cacheSlotId", "TEXT", required = true),
    column("cacheOccurrenceDate", "TEXT", required = true),
    column("teamId", "TEXT", required = true),
    column("teamName", "TEXT", required = true),
    column("paymentHasBill", "INTEGER", required = true),
    column("paymentBillId", "TEXT"),
    column("paymentTotalAmountCents", "INTEGER", required = true),
    column("paymentPaidAmountCents", "INTEGER", required = true),
    column("paymentStatus", "TEXT"),
    column("paymentIsPaidInFull", "INTEGER", required = true),
    column("paymentPending", "INTEGER", required = true),
    column("paymentInheritedFromTeamBill", "INTEGER", required = true),
    column("documentsSignedCount", "INTEGER", required = true),
    column("documentsRequiredCount", "INTEGER", required = true),
)
private val userComplianceV22Columns = listOf(
    column("eventId", "TEXT", required = true),
    column("cacheSlotId", "TEXT", required = true),
    column("cacheOccurrenceDate", "TEXT", required = true),
    column("parentTeamId", "TEXT", required = true),
    column("userId", "TEXT", required = true),
    column("fullName", "TEXT", required = true),
    column("userName", "TEXT"),
    column("isMinorAtEvent", "INTEGER", required = true),
    column("registrationType", "TEXT", required = true),
    column("paymentHasBill", "INTEGER", required = true),
    column("paymentBillId", "TEXT"),
    column("paymentTotalAmountCents", "INTEGER", required = true),
    column("paymentPaidAmountCents", "INTEGER", required = true),
    column("paymentStatus", "TEXT"),
    column("paymentIsPaidInFull", "INTEGER", required = true),
    column("paymentPending", "INTEGER", required = true),
    column("paymentInheritedFromTeamBill", "INTEGER", required = true),
    column("documentsSignedCount", "INTEGER", required = true),
    column("documentsRequiredCount", "INTEGER", required = true),
    column("requiredDocumentsJson", "TEXT", required = true),
)
private val teamComplianceV23Columns = teamComplianceV22Columns +
    column("registrationAnswersJson", "TEXT", required = true)
private val userComplianceV23Columns = userComplianceV22Columns +
    column("registrationAnswersJson", "TEXT", required = true)
private val teamComplianceV28Columns = teamComplianceV23Columns + listOf(
    column("manualPaymentProofStatus", "TEXT"),
    column("manualPaymentProofCount", "INTEGER", required = true),
)
private val userComplianceV28Columns = userComplianceV23Columns + listOf(
    column("manualPaymentProofStatus", "TEXT"),
    column("manualPaymentProofCount", "INTEGER", required = true),
)
private val teamComplianceV31Columns = teamComplianceV28Columns + listOf(
    column("paymentOriginalAmountCents", "INTEGER", required = true),
    column("paymentDiscountAmountCents", "INTEGER", required = true),
    column("paymentDiscountedAmountCents", "INTEGER", required = true),
    column("paymentDiscountsJson", "TEXT", required = true),
)
private val userComplianceV31Columns = userComplianceV28Columns + listOf(
    column("paymentOriginalAmountCents", "INTEGER", required = true),
    column("paymentDiscountAmountCents", "INTEGER", required = true),
    column("paymentDiscountedAmountCents", "INTEGER", required = true),
    column("paymentDiscountsJson", "TEXT", required = true),
)

private val teamCompliancePrimaryKey = listOf(
    "eventId",
    "cacheSlotId",
    "cacheOccurrenceDate",
    "teamId",
)
private val userCompliancePrimaryKey = listOf(
    "eventId",
    "cacheSlotId",
    "cacheOccurrenceDate",
    "parentTeamId",
    "userId",
)
private val teamComplianceIndices = listOf(
    "CREATE INDEX IF NOT EXISTS `index_event_team_compliance_summaries_eventId_cacheSlotId_cacheOccurrenceDate` ON `event_team_compliance_summaries` (`eventId`, `cacheSlotId`, `cacheOccurrenceDate`)",
    "CREATE INDEX IF NOT EXISTS `index_event_team_compliance_summaries_teamId` ON `event_team_compliance_summaries` (`teamId`)",
)
private val userComplianceIndices = listOf(
    "CREATE INDEX IF NOT EXISTS `index_event_user_compliance_summaries_eventId_cacheSlotId_cacheOccurrenceDate` ON `event_user_compliance_summaries` (`eventId`, `cacheSlotId`, `cacheOccurrenceDate`)",
    "CREATE INDEX IF NOT EXISTS `index_event_user_compliance_summaries_parentTeamId` ON `event_user_compliance_summaries` (`parentTeamId`)",
    "CREATE INDEX IF NOT EXISTS `index_event_user_compliance_summaries_userId` ON `event_user_compliance_summaries` (`userId`)",
)

private val refundV32Columns = listOf(
    column("id", "TEXT", required = true),
    column("eventId", "TEXT", required = true),
    column("userId", "TEXT", required = true),
    column("hostId", "TEXT"),
    column("reason", "TEXT", required = true),
    column("organizationId", "TEXT"),
    column("status", "TEXT"),
)
private val refundV33Columns = refundV32Columns + listOf(
    column("createdAt", "TEXT"),
    column("requestedByUserId", "TEXT"),
    column("teamId", "TEXT"),
    column("slotId", "TEXT"),
    column("occurrenceDate", "TEXT"),
    column("billIds", "TEXT", required = true),
    column("paymentIds", "TEXT", required = true),
    column("requestedAmountCents", "INTEGER", required = true),
    column("currency", "TEXT", required = true),
    column("policyDecision", "TEXT"),
    column("scopeVersion", "INTEGER", required = true),
    column("scopeHash", "TEXT"),
)

private val pendingRentalV34Columns = listOf(
    column("id", "TEXT", required = true),
    column("publicSlug", "TEXT", required = true),
    column("eventId", "TEXT", required = true),
    column("selectionsJson", "TEXT", required = true),
    column("paymentIntentId", "TEXT"),
    column("renterOrganizationId", "TEXT"),
    column("sportId", "TEXT"),
    column("status", "TEXT", required = true),
    column("attemptCount", "INTEGER", required = true),
    column("lastError", "TEXT"),
    column("createdAt", "TEXT", required = true),
    column("lastAttemptAt", "TEXT"),
)
private val pendingRentalV35Columns = pendingRentalV34Columns.flatMap { existingColumn ->
    if (existingColumn.name == "paymentIntentId") {
        listOf(existingColumn, column("payerUserId", "TEXT", required = true))
    } else {
        listOf(existingColumn)
    }
}
private val pendingRentalIndices = listOf(
    "CREATE INDEX IF NOT EXISTS `index_PendingRentalOrder_status` ON `PendingRentalOrder` (`status`)",
    "CREATE INDEX IF NOT EXISTS `index_PendingRentalOrder_createdAt` ON `PendingRentalOrder` (`createdAt`)",
)

private val teamReferenceBackupSql = listOf(
    "DROP TABLE IF EXISTS `team_user_cross_ref_migration_backup`",
    "DROP TABLE IF EXISTS `team_pending_player_cross_ref_migration_backup`",
    "DROP TABLE IF EXISTS `event_team_cross_ref_migration_backup`",
    "CREATE TABLE `team_user_cross_ref_migration_backup` AS SELECT `teamId`, `userId` FROM `team_user_cross_ref`",
    "CREATE TABLE `team_pending_player_cross_ref_migration_backup` AS SELECT `teamId`, `userId` FROM `team_pending_player_cross_ref`",
    "CREATE TABLE `event_team_cross_ref_migration_backup` AS SELECT `teamId`, `eventId` FROM `event_team_cross_ref`",
)
private val teamReferenceRestoreSql = listOf(
    "INSERT OR IGNORE INTO `team_user_cross_ref` (`teamId`, `userId`) SELECT b.`teamId`, b.`userId` FROM `team_user_cross_ref_migration_backup` b INNER JOIN `Team` t ON t.`id` = b.`teamId` INNER JOIN `UserData` u ON u.`id` = b.`userId`",
    "INSERT OR IGNORE INTO `team_pending_player_cross_ref` (`teamId`, `userId`) SELECT b.`teamId`, b.`userId` FROM `team_pending_player_cross_ref_migration_backup` b INNER JOIN `Team` t ON t.`id` = b.`teamId` INNER JOIN `UserData` u ON u.`id` = b.`userId`",
    "INSERT OR IGNORE INTO `event_team_cross_ref` (`teamId`, `eventId`) SELECT b.`teamId`, b.`eventId` FROM `event_team_cross_ref_migration_backup` b INNER JOIN `Team` t ON t.`id` = b.`teamId` INNER JOIN `Event` e ON e.`id` = b.`eventId`",
    "DROP TABLE IF EXISTS `team_user_cross_ref_migration_backup`",
    "DROP TABLE IF EXISTS `team_pending_player_cross_ref_migration_backup`",
    "DROP TABLE IF EXISTS `event_team_cross_ref_migration_backup`",
)
private val eventReferenceBackupSql = listOf(
    "DROP TABLE IF EXISTS `user_event_cross_ref_migration_backup`",
    "DROP TABLE IF EXISTS `event_team_cross_ref_event_migration_backup`",
    "CREATE TABLE `user_event_cross_ref_migration_backup` AS SELECT `userId`, `eventId` FROM `user_event_cross_ref`",
    "CREATE TABLE `event_team_cross_ref_event_migration_backup` AS SELECT `teamId`, `eventId` FROM `event_team_cross_ref`",
)
private val eventReferenceRestoreSql = listOf(
    "INSERT OR IGNORE INTO `user_event_cross_ref` (`userId`, `eventId`) SELECT b.`userId`, b.`eventId` FROM `user_event_cross_ref_migration_backup` b INNER JOIN `UserData` u ON u.`id` = b.`userId` INNER JOIN `Event` e ON e.`id` = b.`eventId`",
    "INSERT OR IGNORE INTO `event_team_cross_ref` (`teamId`, `eventId`) SELECT b.`teamId`, b.`eventId` FROM `event_team_cross_ref_event_migration_backup` b INNER JOIN `Team` t ON t.`id` = b.`teamId` INNER JOIN `Event` e ON e.`id` = b.`eventId`",
    "DROP TABLE IF EXISTS `user_event_cross_ref_migration_backup`",
    "DROP TABLE IF EXISTS `event_team_cross_ref_event_migration_backup`",
)
private val userReferenceBackupSql = listOf(
    "DROP TABLE IF EXISTS `team_user_cross_ref_user_migration_backup`",
    "DROP TABLE IF EXISTS `team_pending_player_cross_ref_user_migration_backup`",
    "DROP TABLE IF EXISTS `user_event_cross_ref_user_migration_backup`",
    "DROP TABLE IF EXISTS `chat_user_cross_ref_user_migration_backup`",
    "CREATE TABLE `team_user_cross_ref_user_migration_backup` AS SELECT `teamId`, `userId` FROM `team_user_cross_ref`",
    "CREATE TABLE `team_pending_player_cross_ref_user_migration_backup` AS SELECT `teamId`, `userId` FROM `team_pending_player_cross_ref`",
    "CREATE TABLE `user_event_cross_ref_user_migration_backup` AS SELECT `userId`, `eventId` FROM `user_event_cross_ref`",
    "CREATE TABLE `chat_user_cross_ref_user_migration_backup` AS SELECT `chatId`, `userId` FROM `chat_user_cross_ref`",
)
private val userReferenceRestoreSql = listOf(
    "INSERT OR IGNORE INTO `team_user_cross_ref` (`teamId`, `userId`) SELECT b.`teamId`, b.`userId` FROM `team_user_cross_ref_user_migration_backup` b INNER JOIN `Team` t ON t.`id` = b.`teamId` INNER JOIN `UserData` u ON u.`id` = b.`userId`",
    "INSERT OR IGNORE INTO `team_pending_player_cross_ref` (`teamId`, `userId`) SELECT b.`teamId`, b.`userId` FROM `team_pending_player_cross_ref_user_migration_backup` b INNER JOIN `Team` t ON t.`id` = b.`teamId` INNER JOIN `UserData` u ON u.`id` = b.`userId`",
    "INSERT OR IGNORE INTO `user_event_cross_ref` (`userId`, `eventId`) SELECT b.`userId`, b.`eventId` FROM `user_event_cross_ref_user_migration_backup` b INNER JOIN `UserData` u ON u.`id` = b.`userId` INNER JOIN `Event` e ON e.`id` = b.`eventId`",
    "INSERT OR IGNORE INTO `chat_user_cross_ref` (`chatId`, `userId`) SELECT b.`chatId`, b.`userId` FROM `chat_user_cross_ref_user_migration_backup` b INNER JOIN `ChatGroup` c ON c.`id` = b.`chatId` INNER JOIN `UserData` u ON u.`id` = b.`userId`",
    "DROP TABLE IF EXISTS `team_user_cross_ref_user_migration_backup`",
    "DROP TABLE IF EXISTS `team_pending_player_cross_ref_user_migration_backup`",
    "DROP TABLE IF EXISTS `user_event_cross_ref_user_migration_backup`",
    "DROP TABLE IF EXISTS `chat_user_cross_ref_user_migration_backup`",
)

private fun rebuildTeamSql(
    columns: List<MigrationColumn>,
    backfills: Map<String, String> = emptyMap(),
): List<String> = teamReferenceBackupSql +
    rebuildTableSql("Team", columns, primaryKey = listOf("id"), backfills = backfills) +
    teamReferenceRestoreSql

private fun rebuildEventSql(
    columns: List<MigrationColumn>,
    backfills: Map<String, String> = emptyMap(),
): List<String> = eventReferenceBackupSql +
    rebuildTableSql("Event", columns, primaryKey = listOf("id"), backfills = backfills) +
    eventReferenceRestoreSql

private fun rebuildUserSql(
    columns: List<MigrationColumn>,
    backfills: Map<String, String> = emptyMap(),
): List<String> = userReferenceBackupSql +
    rebuildTableSql("UserData", columns, primaryKey = listOf("id"), backfills = backfills) +
    userReferenceRestoreSql

private fun rebuildTeamComplianceSql(
    columns: List<MigrationColumn>,
    backfills: Map<String, String> = emptyMap(),
): List<String> = rebuildTableSql(
    tableName = "event_team_compliance_summaries",
    columns = columns,
    primaryKey = teamCompliancePrimaryKey,
    backfills = backfills,
    indices = teamComplianceIndices,
)

private fun rebuildUserComplianceSql(
    columns: List<MigrationColumn>,
    backfills: Map<String, String> = emptyMap(),
): List<String> = rebuildTableSql(
    tableName = "event_user_compliance_summaries",
    columns = columns,
    primaryKey = userCompliancePrimaryKey,
    backfills = backfills,
    indices = userComplianceIndices,
)

/**
 * v3 and v4 were released against the same Android database name as the modern app. These
 * rebuilds preserve the renamed official fields and the existing cross-reference rows instead
 * of requiring a destructive reset before the v7 lineage begins.
 */
val MIGRATION_3_4_OFFICIAL_TERMINOLOGY_AND_PRIVACY = migration(
    3,
    4,
    rebuildEventSql(
        eventV4Columns,
        backfills = mapOf(
            "doTeamsOfficiate" to "`doTeamsRef`",
            "teamOfficialsMaySwap" to "`teamRefsMaySwap`",
            "officialIds" to "`refereeIds`",
        ),
    ) + rebuildTableSql(
        tableName = "MatchMVP",
        columns = matchV4Columns,
        primaryKey = listOf("id"),
        backfills = mapOf(
            "officialId" to "`refereeId`",
            "officialCheckedIn" to "`refereeCheckedIn`",
            "teamOfficialId" to "`teamRefereeId`",
        ),
    ) + rebuildUserSql(
        userV9Columns,
        backfills = mapOf(
            "privacyDisplayName" to "NULL",
            "isMinor" to "0",
            "isIdentityHidden" to "0",
        ),
    ),
)

val MIGRATION_4_5_NO_SCHEMA_CHANGE = migration(4, 5, emptyList())

val MIGRATION_5_6_EVENT_ADDRESS_AND_OFFICIALS = migration(
    5,
    6,
    rebuildEventSql(
        eventV6Columns,
        backfills = mapOf(
            "address" to "NULL",
            "officialSchedulingMode" to "'SCHEDULE'",
            "officialPositions" to "'[]'",
            "eventOfficials" to "'[]'",
        ),
    ) + rebuildTableSql(
        tableName = "MatchMVP",
        columns = matchV6Columns,
        primaryKey = listOf("id"),
        backfills = mapOf("officialIds" to "'[]'"),
    ),
)

val MIGRATION_6_7_NO_SCHEMA_CHANGE = migration(6, 7, emptyList())

val MIGRATION_7_8_TEAM_NAME_REQUIRED = migration(
    7,
    8,
    rebuildTeamSql(teamV8Columns, backfills = mapOf("name" to "COALESCE(`name`, '')")),
)

val MIGRATION_8_9_CURRENT_USER_EVENT_REGISTRATIONS = migration(
    8,
    9,
    listOf(createTableSql("current_user_event_registrations", registrationV9Columns, listOf("id"))),
)

val MIGRATION_9_10_USER_PRIVACY_AND_CHAT = migration(
    9,
    10,
    rebuildUserSql(
        userV10Columns,
        backfills = mapOf(
            "blockedUserIds" to "'[]'",
            "hiddenEventIds" to "'[]'",
            "chatTermsAcceptedAt" to "NULL",
            "chatTermsVersion" to "NULL",
        ),
    ),
)

val MIGRATION_10_11_TEAM_REGISTRATIONS = migration(
    10,
    11,
    rebuildTeamSql(
        teamV11Columns,
        backfills = mapOf(
            "kind" to "NULL",
            "playerRegistrationIds" to "'[]'",
            "staffAssignmentIds" to "'[]'",
            "playerRegistrations" to "'[]'",
            "staffAssignments" to "'[]'",
        ),
    ) + listOf(
        "ALTER TABLE `current_user_event_registrations` ADD COLUMN `eventTeamId` TEXT",
        "ALTER TABLE `current_user_event_registrations` ADD COLUMN `sourceTeamRegistrationId` TEXT",
        "ALTER TABLE `current_user_event_registrations` ADD COLUMN `jerseyNumber` TEXT",
        "ALTER TABLE `current_user_event_registrations` ADD COLUMN `position` TEXT",
        "ALTER TABLE `current_user_event_registrations` ADD COLUMN `isCaptain` INTEGER",
    ),
)

val MIGRATION_11_12_MATCH_STATE_AND_RULES = migration(
    11,
    12,
    rebuildEventSql(
        eventV12Columns,
        backfills = mapOf("autoCreatePointMatchIncidents" to "0"),
    ) + rebuildTableSql(
        tableName = "MatchMVP",
        columns = matchV12Columns,
        primaryKey = listOf("id"),
        backfills = mapOf(
            "status" to "NULL",
            "resultStatus" to "NULL",
            "resultType" to "NULL",
            "actualStart" to "NULL",
            "actualEnd" to "NULL",
            "statusReason" to "NULL",
            "winnerEventTeamId" to "NULL",
            "matchRulesSnapshot" to "NULL",
            "resolvedMatchRules" to "NULL",
            "segments" to "'[]'",
            "incidents" to "'[]'",
        ),
    ),
)

val MIGRATION_12_13_EVENT_RULE_OVERRIDES = migration(
    12,
    13,
    listOf(
        "ALTER TABLE `Event` ADD COLUMN `matchRulesOverride` TEXT",
        "ALTER TABLE `Event` ADD COLUMN `resolvedMatchRules` TEXT",
    ),
)

val MIGRATION_13_14_TEAM_ORGANIZATION_FIELDS = migration(
    13,
    14,
    rebuildTeamSql(
        teamV14Columns,
        backfills = mapOf(
            "organizationId" to "NULL",
            "createdBy" to "NULL",
            "openRegistration" to "0",
            "registrationPriceCents" to "0",
        ),
    ),
)

val MIGRATION_14_15_TEAM_REQUIRED_TEMPLATES = migration(
    14,
    15,
    rebuildTeamSql(teamV15Columns, backfills = mapOf("requiredTemplateIds" to "'[]'")),
)

val MIGRATION_15_16_EVENT_INSTALLMENT_DUE_DAYS = migration(
    15,
    16,
    rebuildEventSql(
        eventV16Columns,
        backfills = mapOf("installmentDueRelativeDays" to "'[]'"),
    ),
)

val MIGRATION_16_17_REMOVE_TEAM_DIVISION_TYPE_NAME = migration(
    16,
    17,
    rebuildTeamSql(teamV17Columns),
)

val MIGRATION_17_18_EVENT_REFUND_HOURS_NULLABLE = migration(
    17,
    18,
    rebuildEventSql(eventV18Columns),
)

val MIGRATION_18_19_EVENT_SPLIT_PLAYOFF_DIVISIONS = migration(
    18,
    19,
    rebuildEventSql(
        eventV19Columns,
        backfills = mapOf("splitLeaguePlayoffDivisions" to "0"),
    ),
)

val MIGRATION_19_20_EVENT_TIME_ZONE = migration(
    19,
    20,
    rebuildEventSql(eventV20Columns, backfills = mapOf("timeZone" to "'UTC'")),
)

val MIGRATION_20_21_USER_NOTIFICATION_SETTINGS = migration(
    20,
    21,
    rebuildUserSql(
        userV21Columns,
        backfills = mapOf(
            "notificationSettings" to "'{\"invitations\":{\"email\":true,\"push\":true},\"eventAnnouncements\":{\"email\":true,\"push\":true},\"matchScheduleUpdates\":{\"email\":false,\"push\":true},\"chatMessages\":{\"email\":false,\"push\":true},\"newEventsFromConnections\":{\"email\":true,\"push\":true},\"hostActionRequired\":{\"email\":true,\"push\":true}}'",
        ),
    ),
)

val MIGRATION_21_22_EVENT_PARTICIPANT_CACHES = migration(
    21,
    22,
    listOf(
        createTableSql(
            "event_participant_management_entries",
            listOf(
                column("eventId", "TEXT", required = true),
                column("cacheSlotId", "TEXT", required = true),
                column("cacheOccurrenceDate", "TEXT", required = true),
                column("section", "TEXT", required = true),
                column("registrationId", "TEXT", required = true),
                column("sortOrder", "INTEGER", required = true),
                column("registrantId", "TEXT", required = true),
                column("registrantType", "TEXT", required = true),
                column("rosterRole", "TEXT"),
                column("status", "TEXT"),
                column("parentId", "TEXT"),
                column("divisionId", "TEXT"),
                column("divisionTypeId", "TEXT"),
                column("divisionTypeKey", "TEXT"),
                column("consentDocumentId", "TEXT"),
                column("consentStatus", "TEXT"),
                column("slotId", "TEXT"),
                column("occurrenceDate", "TEXT"),
                column("createdAt", "TEXT"),
                column("updatedAt", "TEXT"),
            ),
            primaryKey = listOf("eventId", "cacheSlotId", "cacheOccurrenceDate", "section", "registrationId"),
        ),
        "CREATE INDEX IF NOT EXISTS `index_event_participant_management_entries_eventId_cacheSlotId_cacheOccurrenceDate` ON `event_participant_management_entries` (`eventId`, `cacheSlotId`, `cacheOccurrenceDate`)",
        "CREATE INDEX IF NOT EXISTS `index_event_participant_management_entries_registrantId` ON `event_participant_management_entries` (`registrantId`)",
        createTableSql("event_team_compliance_summaries", teamComplianceV22Columns, teamCompliancePrimaryKey),
        *teamComplianceIndices.toTypedArray(),
        createTableSql("event_user_compliance_summaries", userComplianceV22Columns, userCompliancePrimaryKey),
        *userComplianceIndices.toTypedArray(),
    ),
)

val MIGRATION_22_23_TEAM_JOIN_POLICY_AND_ANSWERS = migration(
    22,
    23,
    rebuildTeamComplianceSql(
        teamComplianceV23Columns,
        backfills = mapOf("registrationAnswersJson" to "'[]'"),
    ) + rebuildUserComplianceSql(
        userComplianceV23Columns,
        backfills = mapOf("registrationAnswersJson" to "'[]'"),
    ) + rebuildTeamSql(
        teamV23Columns,
        backfills = mapOf("joinPolicy" to "'CLOSED'"),
    ),
)

val MIGRATION_23_24_MATCH_OPERATION_OUTBOX = migration(
    23,
    24,
    listOf(
        createTableSql(
            "MatchOperationOutboxEntry",
            listOf(
                column("id", "TEXT", required = true),
                column("eventId", "TEXT", required = true),
                column("matchId", "TEXT", required = true),
                column("operationKind", "TEXT", required = true),
                column("payloadJson", "TEXT", required = true),
                column("status", "TEXT", required = true),
                column("sourceDevice", "TEXT", required = true),
                column("clientDeviceId", "TEXT", required = true),
                column("clientSequence", "INTEGER", required = true),
                column("clientCreatedAt", "TEXT", required = true),
                column("attemptCount", "INTEGER", required = true),
                column("lastError", "TEXT"),
                column("lastAttemptAt", "TEXT"),
                column("ackedAt", "TEXT"),
            ),
            primaryKey = listOf("id"),
        ),
        "CREATE INDEX IF NOT EXISTS `index_MatchOperationOutboxEntry_eventId_matchId` ON `MatchOperationOutboxEntry` (`eventId`, `matchId`)",
        "CREATE INDEX IF NOT EXISTS `index_MatchOperationOutboxEntry_status` ON `MatchOperationOutboxEntry` (`status`)",
        "CREATE INDEX IF NOT EXISTS `index_MatchOperationOutboxEntry_clientSequence` ON `MatchOperationOutboxEntry` (`clientSequence`)",
    ),
)

val MIGRATION_24_25_DISCOUNT_CACHES = migration(
    24,
    25,
    listOf(
        createTableSql(
            "discount_offers",
            listOf(
                column("id", "TEXT", required = true),
                column("ownerType", "TEXT", required = true),
                column("ownerId", "TEXT", required = true),
                column("name", "TEXT", required = true),
                column("description", "TEXT"),
                column("status", "TEXT", required = true),
                column("targetType", "TEXT", required = true),
                column("targetId", "TEXT", required = true),
                column("originalPriceCents", "INTEGER", required = true),
                column("discountedPriceCents", "INTEGER", required = true),
            ),
            primaryKey = listOf("id"),
        ),
        "CREATE INDEX IF NOT EXISTS `index_discount_offers_ownerType_ownerId` ON `discount_offers` (`ownerType`, `ownerId`)",
        createTableSql(
            "discount_codes",
            listOf(
                column("id", "TEXT", required = true),
                column("discountId", "TEXT", required = true),
                column("code", "TEXT", required = true),
                column("usageLimit", "INTEGER"),
                column("usedCount", "INTEGER", required = true),
                column("status", "TEXT", required = true),
            ),
            primaryKey = listOf("id"),
        ),
        "CREATE INDEX IF NOT EXISTS `index_discount_codes_discountId` ON `discount_codes` (`discountId`)",
        createTableSql(
            "discount_targets",
            listOf(
                column("cacheKey", "TEXT", required = true),
                column("ownerType", "TEXT", required = true),
                column("ownerIdKey", "TEXT", required = true),
                column("itemType", "TEXT", required = true),
                column("id", "TEXT", required = true),
                column("label", "TEXT", required = true),
                column("description", "TEXT"),
                column("priceCents", "INTEGER", required = true),
                column("targetType", "TEXT", required = true),
            ),
            primaryKey = listOf("cacheKey"),
        ),
        "CREATE INDEX IF NOT EXISTS `index_discount_targets_ownerType_ownerIdKey_itemType` ON `discount_targets` (`ownerType`, `ownerIdKey`, `itemType`)",
    ),
)

val MIGRATION_25_28_PAYMENT_AND_AFFILIATE_CACHES = migration(
    25,
    28,
    rebuildEventSql(
        eventV28Columns,
        backfills = mapOf(
            "affiliateUrl" to "NULL",
            "registrationPaymentMode" to "'ONLINE'",
            "manualPaymentLinks" to "'[]'",
            "manualPaymentInstructions" to "NULL",
        ),
    ) + listOf(
        "ALTER TABLE `Team` ADD COLUMN `affiliateUrl` TEXT",
    ) + rebuildTeamComplianceSql(
        teamComplianceV28Columns,
        backfills = mapOf(
            "manualPaymentProofStatus" to "NULL",
            "manualPaymentProofCount" to "0",
        ),
    ) + rebuildUserComplianceSql(
        userComplianceV28Columns,
        backfills = mapOf(
            "manualPaymentProofStatus" to "NULL",
            "manualPaymentProofCount" to "0",
        ),
    ),
)

val MIGRATION_28_29_EVENT_SCHEDULE_AND_CHECK_IN = migration(
    28,
    29,
    rebuildEventSql(
        eventV29Columns,
        backfills = mapOf(
            "scheduleText" to "NULL",
            "dateDisplayMode" to "NULL",
            "dateDisplayText" to "NULL",
            "teamCheckInMode" to "'OFF'",
            "teamCheckInOpenMinutesBefore" to "60",
            "allowMatchRosterEdits" to "0",
            "allowTemporaryMatchPlayers" to "0",
        ),
    ),
)

val MIGRATION_29_30_INVITE_CACHE = migration(
    29,
    30,
    listOf(
        createTableSql(
            "Invite",
            listOf(
                column("type", "TEXT", required = true),
                column("email", "TEXT", required = true),
                column("status", "TEXT"),
                column("staffTypes", "TEXT", required = true),
                column("eventId", "TEXT"),
                column("organizationId", "TEXT"),
                column("teamId", "TEXT"),
                column("userId", "TEXT"),
                column("createdBy", "TEXT"),
                column("firstName", "TEXT"),
                column("lastName", "TEXT"),
                column("childUserId", "TEXT"),
                column("childFirstName", "TEXT"),
                column("childLastName", "TEXT"),
                column("childFullName", "TEXT"),
                column("viewerCanAcceptForChild", "INTEGER", required = true),
                column("id", "TEXT", required = true),
            ),
            primaryKey = listOf("id"),
        ),
    ),
)

val MIGRATION_30_31_COMPLIANCE_PAYMENT_BREAKDOWN = migration(
    30,
    31,
    rebuildTeamComplianceSql(
        teamComplianceV31Columns,
        backfills = mapOf(
            "paymentOriginalAmountCents" to "0",
            "paymentDiscountAmountCents" to "0",
            "paymentDiscountedAmountCents" to "0",
            "paymentDiscountsJson" to "'[]'",
        ),
    ) + rebuildUserComplianceSql(
        userComplianceV31Columns,
        backfills = mapOf(
            "paymentOriginalAmountCents" to "0",
            "paymentDiscountAmountCents" to "0",
            "paymentDiscountedAmountCents" to "0",
            "paymentDiscountsJson" to "'[]'",
        ),
    ),
)

val MIGRATION_31_32_EVENT_TAGS = migration(
    31,
    32,
    rebuildEventSql(eventV32Columns, backfills = mapOf("tags" to "'[]'")),
)

val MIGRATION_32_33_REFUND_SCOPE = migration(
    32,
    33,
    rebuildTableSql(
        tableName = "RefundRequest",
        columns = refundV33Columns,
        primaryKey = listOf("id"),
        backfills = mapOf(
            "createdAt" to "NULL",
            "requestedByUserId" to "NULL",
            "teamId" to "NULL",
            "slotId" to "NULL",
            "occurrenceDate" to "NULL",
            "billIds" to "'[]'",
            "paymentIds" to "'[]'",
            "requestedAmountCents" to "0",
            "currency" to "'usd'",
            "policyDecision" to "NULL",
            "scopeVersion" to "1",
            "scopeHash" to "NULL",
        ),
    ),
)

val MIGRATION_33_34_PENDING_RENTAL_ORDERS = migration(
    33,
    34,
    listOf(
        createTableSql("PendingRentalOrder", pendingRentalV34Columns, primaryKey = listOf("id")),
        *pendingRentalIndices.toTypedArray(),
    ),
)

private const val LEGACY_PENDING_RENTAL_RECOVERY_MESSAGE =
    "Pending rental payment was safely rejected after this update because its payer could not be verified. Create a new checkout to retry."

/**
 * v34 rows did not record the payer. They are deliberately quarantined rather than replayed
 * under whichever account next opens the app.
 */
val MIGRATION_34_35_PENDING_RENTAL_PAYER_SCOPE = migration(
    34,
    35,
    rebuildTableSql(
        tableName = "PendingRentalOrder",
        columns = pendingRentalV35Columns,
        primaryKey = listOf("id"),
        backfills = mapOf(
            "payerUserId" to "'$PENDING_RENTAL_ORDER_LEGACY_UNKNOWN_PAYER_ID'",
            "status" to "'REJECTED'",
            "lastError" to "CASE WHEN `lastError` IS NULL OR TRIM(`lastError`) = '' THEN '$LEGACY_PENDING_RENTAL_RECOVERY_MESSAGE' ELSE `lastError` || ' $LEGACY_PENDING_RENTAL_RECOVERY_MESSAGE' END",
        ),
        indices = pendingRentalIndices,
    ),
)

/**
 * There were no source commits with database versions 26 or 27. Version 25 upgrades directly
 * to the released v28 schema; do not add synthetic 25 -> 26 -> 27 -> 28 edges.
 */
internal val MVP_DATABASE_MIGRATIONS_7_TO_35: Array<Migration> = arrayOf(
    MIGRATION_7_8_TEAM_NAME_REQUIRED,
    MIGRATION_8_9_CURRENT_USER_EVENT_REGISTRATIONS,
    MIGRATION_9_10_USER_PRIVACY_AND_CHAT,
    MIGRATION_10_11_TEAM_REGISTRATIONS,
    MIGRATION_11_12_MATCH_STATE_AND_RULES,
    MIGRATION_12_13_EVENT_RULE_OVERRIDES,
    MIGRATION_13_14_TEAM_ORGANIZATION_FIELDS,
    MIGRATION_14_15_TEAM_REQUIRED_TEMPLATES,
    MIGRATION_15_16_EVENT_INSTALLMENT_DUE_DAYS,
    MIGRATION_16_17_REMOVE_TEAM_DIVISION_TYPE_NAME,
    MIGRATION_17_18_EVENT_REFUND_HOURS_NULLABLE,
    MIGRATION_18_19_EVENT_SPLIT_PLAYOFF_DIVISIONS,
    MIGRATION_19_20_EVENT_TIME_ZONE,
    MIGRATION_20_21_USER_NOTIFICATION_SETTINGS,
    MIGRATION_21_22_EVENT_PARTICIPANT_CACHES,
    MIGRATION_22_23_TEAM_JOIN_POLICY_AND_ANSWERS,
    MIGRATION_23_24_MATCH_OPERATION_OUTBOX,
    MIGRATION_24_25_DISCOUNT_CACHES,
    MIGRATION_25_28_PAYMENT_AND_AFFILIATE_CACHES,
    MIGRATION_28_29_EVENT_SCHEDULE_AND_CHECK_IN,
    MIGRATION_29_30_INVITE_CACHE,
    MIGRATION_30_31_COMPLIANCE_PAYMENT_BREAKDOWN,
    MIGRATION_31_32_EVENT_TAGS,
    MIGRATION_32_33_REFUND_SCOPE,
    MIGRATION_33_34_PENDING_RENTAL_ORDERS,
    MIGRATION_34_35_PENDING_RENTAL_PAYER_SCOPE,
)

/**
 * Current schema v90 deliberately keeps the v35 table shape. The higher number is required so
 * legacy installed databases whose historical version numbers reached 89 upgrade instead of
 * being treated as a downgrade by Room.
 */
val MIGRATION_35_90_LEGACY_VERSION_CONTINUITY = migration(35, 90, emptyList())

/**
 * Facility membership is canonical server data and is needed to group cached fields when the
 * client falls back to Room. Facility details remain hydrated separately, but the ID itself must
 * survive every Room round trip.
 */
val MIGRATION_90_91_FIELD_FACILITY_ID = migration(
    90,
    91,
    listOf("ALTER TABLE `Field` ADD COLUMN `facilityId` TEXT"),
)

val MVP_DATABASE_MIGRATIONS: Array<Migration> = arrayOf(
    MIGRATION_3_4_OFFICIAL_TERMINOLOGY_AND_PRIVACY,
    MIGRATION_4_5_NO_SCHEMA_CHANGE,
    MIGRATION_5_6_EVENT_ADDRESS_AND_OFFICIALS,
    MIGRATION_6_7_NO_SCHEMA_CHANGE,
    *MVP_DATABASE_MIGRATIONS_7_TO_35,
    MIGRATION_35_90_LEGACY_VERSION_CONTINUITY,
    *LEGACY_DATABASE_MIGRATIONS,
    MIGRATION_90_91_FIELD_FACILITY_ID,
)
