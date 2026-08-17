package com.razumly.mvp.core.data

import androidx.room.migration.Migration
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlin.use

/**
 * The first Android releases used versions 50–69 for the same `tournament.db` file and then
 * reset the version sequence to 3. These bridges preserve their raw rows under `legacy_v*_*`,
 * normalize the representable data to the evidenced v7 schema, and then reuse the v7→v35
 * migrations. The archive tables retain fields that no longer have a current Room column (for
 * example old tournament scoring limits, image URLs, and invite lists) instead of discarding
 * them during a version-number discontinuity.
 */
private enum class LegacySchemaFamily {
    SPLIT_EVENT_AND_TOURNAMENT,
    UNIFIED_EVENT,
    MODERN_EVENT,
}

private enum class LegacyStripeColumn {
    NONE,
    ACCOUNT_ID,
    STRIPE_ACCOUNT_ID,
    HAS_STRIPE_ACCOUNT,
}

private data class LegacySourceProfile(
    val version: Int,
    val family: LegacySchemaFamily,
    val hasRefundRequest: Boolean,
    val stripeColumn: LegacyStripeColumn,
    val hasFriendRequestFields: Boolean = false,
    val hasUploadedImages: Boolean = false,
    val userProfileImageColumn: String? = null,
    val teamPlayerColumn: String = "players",
    val teamProfileImageColumn: String? = null,
    val teamHasManagerId: Boolean = false,
    val teamHasHeadCoachId: Boolean = false,
    val teamHasCoachIds: Boolean = false,
    val teamHasParentTeamId: Boolean = false,
    val teamHasSport: Boolean = false,
    val teamHasDivisionMetadata: Boolean = false,
    val chatHasImageFields: Boolean = false,
    val hasParticipantIds: Boolean = false,
    val hasCancellationRefundHours: Boolean = false,
    val hasRegistrationCutoffHours: Boolean = false,
    val hasSeedColor: Boolean = false,
    val hasTournamentPrize: Boolean,
    val eventUsesPriceCents: Boolean = false,
    val eventHasDivisionDetails: Boolean = false,
    val eventHasNoFixedEndDateTime: Boolean = false,
    val eventHasAssistantHostIds: Boolean = false,
    val eventUsesDoTeamsRef: Boolean = false,
    val eventTeamOfficialsMaySwapSourceColumn: String? = null,
    val matchUsesCurrentColumns: Boolean = false,
    val matchEventIdColumn: String = "tournamentId",
    val matchHasSeeds: Boolean = false,
    val matchHasLocked: Boolean = false,
)

private val legacyV50Profile = LegacySourceProfile(
    version = 50,
    family = LegacySchemaFamily.SPLIT_EVENT_AND_TOURNAMENT,
    hasRefundRequest = false,
    stripeColumn = LegacyStripeColumn.NONE,
    hasTournamentPrize = false,
)
private val legacyV51Profile = legacyV50Profile.copy(
    version = 51,
    stripeColumn = LegacyStripeColumn.STRIPE_ACCOUNT_ID,
)
private val legacyV52Profile = legacyV51Profile.copy(version = 52)
private val legacyV53Profile = legacyV52Profile.copy(version = 53)
private val legacyV54Profile = legacyV52Profile.copy(
    version = 54,
    hasCancellationRefundHours = true,
)
private val legacyV55Profile = legacyV54Profile.copy(version = 55)
private val legacyV59Profile = legacyV54Profile.copy(
    version = 59,
    teamPlayerColumn = "playerIds",
    hasParticipantIds = true,
)
private val legacyV60Profile = legacyV59Profile.copy(
    version = 60,
    hasTournamentPrize = true,
)
private val legacyV61Profile = legacyV60Profile.copy(version = 61)
private val legacyV62Profile = legacyV60Profile.copy(
    version = 62,
    hasRegistrationCutoffHours = true,
)
private val legacyV63Profile = legacyV62Profile.copy(
    version = 63,
    hasRefundRequest = true,
)
private val legacyV64Profile = legacyV63Profile.copy(
    version = 64,
    stripeColumn = LegacyStripeColumn.HAS_STRIPE_ACCOUNT,
    hasSeedColor = true,
)
private val legacyV65Profile = legacyV64Profile.copy(version = 65)
private val legacyV66Profile = legacyV64Profile.copy(version = 66)
private val legacyV67Profile = legacyV64Profile.copy(version = 67)
private val legacyV68Profile = legacyV64Profile.copy(
    version = 68,
    hasUploadedImages = true,
)
private val legacyV69Profile = legacyV68Profile.copy(
    version = 69,
    hasFriendRequestFields = true,
)
private val legacyV70Profile = legacyV69Profile.copy(
    version = 70,
    userProfileImageColumn = "profileImage",
)
private val legacyV71Profile = legacyV70Profile.copy(
    version = 71,
    teamProfileImageColumn = "profileImage",
    chatHasImageFields = true,
)
private val legacyV72Profile = legacyV71Profile.copy(version = 72)
private val legacyV73Profile = legacyV71Profile.copy(version = 73)

private val legacyV74Profile = LegacySourceProfile(
    version = 74,
    family = LegacySchemaFamily.UNIFIED_EVENT,
    hasRefundRequest = true,
    stripeColumn = LegacyStripeColumn.HAS_STRIPE_ACCOUNT,
    hasFriendRequestFields = true,
    hasUploadedImages = true,
    userProfileImageColumn = "profileImage",
    teamPlayerColumn = "playerIds",
    teamProfileImageColumn = "profileImage",
    chatHasImageFields = true,
    hasTournamentPrize = false,
)
private val legacyV75Profile = legacyV74Profile.copy(version = 75)
private val legacyV76Profile = legacyV74Profile.copy(
    version = 76,
    eventUsesDoTeamsRef = true,
)
private val legacyV77Profile = legacyV76Profile.copy(version = 77)
private val legacyV78Profile = legacyV77Profile.copy(
    version = 78,
    matchEventIdColumn = "eventId",
)
private val legacyV79Profile = legacyV78Profile.copy(version = 79)

private val legacyV80Profile = LegacySourceProfile(
    version = 80,
    family = LegacySchemaFamily.MODERN_EVENT,
    hasRefundRequest = true,
    stripeColumn = LegacyStripeColumn.HAS_STRIPE_ACCOUNT,
    hasFriendRequestFields = true,
    hasUploadedImages = true,
    userProfileImageColumn = "profileImageId",
    teamPlayerColumn = "playerIds",
    teamProfileImageColumn = "profileImageId",
    teamHasManagerId = true,
    teamHasCoachIds = true,
    teamHasParentTeamId = true,
    teamHasSport = true,
    chatHasImageFields = true,
    hasTournamentPrize = false,
    eventUsesPriceCents = true,
    eventUsesDoTeamsRef = true,
    matchUsesCurrentColumns = true,
    matchEventIdColumn = "eventId",
)
private val legacyV81Profile = legacyV80Profile.copy(version = 81)
private val legacyV82Profile = legacyV81Profile.copy(
    version = 82,
    eventHasDivisionDetails = true,
)
private val legacyV83Profile = legacyV82Profile.copy(
    version = 83,
    eventHasNoFixedEndDateTime = true,
    teamHasHeadCoachId = true,
)
private val legacyV84Profile = legacyV83Profile.copy(
    version = 84,
    matchHasLocked = true,
)
private val legacyV85Profile = legacyV84Profile.copy(
    version = 85,
    eventHasAssistantHostIds = true,
)
private val legacyV86Profile = legacyV85Profile.copy(version = 86)
private val legacyV87Profile = legacyV86Profile.copy(
    version = 87,
    teamHasDivisionMetadata = true,
)
private val legacyV88Profile = legacyV87Profile.copy(
    version = 88,
    matchHasSeeds = true,
)
private val legacyV89Profile = legacyV88Profile.copy(
    version = 89,
    // 88 -> 89 added this legacy source name.  The current v7 bridge writes
    // it into the normalized `teamOfficialsMaySwap` column below.
    eventTeamOfficialsMaySwapSourceColumn = "teamRefsMaySwap",
)

private fun legacyArchiveName(profile: LegacySourceProfile, tableName: String): String =
    "legacy_v${profile.version}_$tableName"

private fun legacyBridgeMigration(
    profile: LegacySourceProfile,
): Migration = object : Migration(profile.version, 90) {
    override fun migrate(db: SupportSQLiteDatabase) {
        val statements = legacyBridgeSql(resolveLegacyProfile(profile, db.userDataColumns()))
        statements.forEach(db::execSQL)
        MVP_DATABASE_MIGRATIONS_7_TO_35.forEach { migration -> migration.migrate(db) }
    }

    override fun migrate(connection: SQLiteConnection) {
        val statements = legacyBridgeSql(resolveLegacyProfile(profile, connection.userDataColumns()))
        statements.forEach { sql ->
            connection.prepare(sql).use { statement -> statement.step() }
        }
        MVP_DATABASE_MIGRATIONS_7_TO_35.forEach { migration -> migration.migrate(connection) }
    }
}

private fun resolveLegacyProfile(
    profile: LegacySourceProfile,
    userDataColumns: Set<String>,
): LegacySourceProfile = when {
    profile.version == 50 && "accountId" in userDataColumns -> profile.copy(
        stripeColumn = LegacyStripeColumn.ACCOUNT_ID,
    )
    profile.version == 50 -> profile.copy(stripeColumn = LegacyStripeColumn.NONE)
    else -> profile
}

private fun SupportSQLiteDatabase.userDataColumns(): Set<String> =
    query("PRAGMA table_info(`UserData`)").use { cursor ->
        buildSet {
            val nameColumn = cursor.getColumnIndexOrThrow("name")
            while (cursor.moveToNext()) add(cursor.getString(nameColumn))
        }
    }

private fun SQLiteConnection.userDataColumns(): Set<String> =
    prepare("PRAGMA table_info(`UserData`)").use { statement ->
        buildSet {
            while (statement.step()) add(statement.getText(1))
        }
    }

private fun legacyBridgeSql(profile: LegacySourceProfile): List<String> =
    snapshotLegacyTables(profile) +
        dropLegacySourceTables(profile) +
        legacyV7TargetSchemaSql +
        when (profile.family) {
            LegacySchemaFamily.SPLIT_EVENT_AND_TOURNAMENT -> migrateLegacyRowsToV7(profile)
            LegacySchemaFamily.UNIFIED_EVENT -> migrateUnifiedEventRowsToV7(profile)
            LegacySchemaFamily.MODERN_EVENT -> migrateModernEventRowsToV7(profile)
        }

private fun snapshotLegacyTables(profile: LegacySourceProfile): List<String> =
    legacySourceTables(profile).map { tableName ->
        "CREATE TABLE `${legacyArchiveName(profile, tableName)}` AS SELECT * FROM `$tableName`"
    }

private fun legacySourceTables(profile: LegacySourceProfile): List<String> {
    val commonTables = listOf(
        "chat_user_cross_ref",
        "ChatGroup",
        "event_team_cross_ref",
        "Field",
        "MatchMVP",
        "MessageMVP",
        "Team",
        "team_pending_player_cross_ref",
        "team_user_cross_ref",
        "user_event_cross_ref",
        "UserData",
    )
    val familyTables = when (profile.family) {
        LegacySchemaFamily.SPLIT_EVENT_AND_TOURNAMENT -> listOf(
            "EventImp",
            "Tournament",
            "field_match_cross_ref",
            "match_team_cross_ref",
            "tournament_match_cross_ref",
            "tournament_team_cross_ref",
            "user_tournament_cross_ref",
        )
        LegacySchemaFamily.UNIFIED_EVENT -> listOf(
            "Event",
            "field_match_cross_ref",
            "match_team_cross_ref",
        )
        LegacySchemaFamily.MODERN_EVENT -> listOf("Event")
    }

    return commonTables + familyTables + if (profile.hasRefundRequest) listOf("RefundRequest") else emptyList()
}

private fun dropLegacySourceTables(profile: LegacySourceProfile): List<String> {
    val crossReferenceTables = when (profile.family) {
        LegacySchemaFamily.SPLIT_EVENT_AND_TOURNAMENT -> listOf(
            "chat_user_cross_ref",
            "event_team_cross_ref",
            "field_match_cross_ref",
            "match_team_cross_ref",
            "team_pending_player_cross_ref",
            "team_user_cross_ref",
            "tournament_match_cross_ref",
            "tournament_team_cross_ref",
            "user_event_cross_ref",
            "user_tournament_cross_ref",
        )
        LegacySchemaFamily.UNIFIED_EVENT -> listOf(
            "chat_user_cross_ref",
            "event_team_cross_ref",
            "field_match_cross_ref",
            "match_team_cross_ref",
            "team_pending_player_cross_ref",
            "team_user_cross_ref",
            "user_event_cross_ref",
        )
        LegacySchemaFamily.MODERN_EVENT -> listOf(
            "chat_user_cross_ref",
            "event_team_cross_ref",
            "team_pending_player_cross_ref",
            "team_user_cross_ref",
            "user_event_cross_ref",
        )
    }
    val entityTables = when (profile.family) {
        LegacySchemaFamily.SPLIT_EVENT_AND_TOURNAMENT -> listOf(
            "Field",
            "MatchMVP",
            "ChatGroup",
            "Team",
            "EventImp",
            "Tournament",
            "UserData",
        )
        LegacySchemaFamily.UNIFIED_EVENT,
        LegacySchemaFamily.MODERN_EVENT,
        -> listOf(
            "Field",
            "MatchMVP",
            "ChatGroup",
            "Team",
            "Event",
            "UserData",
        )
    }

    return (crossReferenceTables + listOf("MessageMVP") +
        (if (profile.hasRefundRequest) listOf("RefundRequest") else emptyList()) + entityTables)
        .map { tableName -> "DROP TABLE `$tableName`" }
}

private val legacyV7TargetSchemaSql = listOf(
    "CREATE TABLE `UserData` (`firstName` TEXT NOT NULL, `lastName` TEXT NOT NULL, `teamIds` TEXT NOT NULL, `friendIds` TEXT NOT NULL, `friendRequestIds` TEXT NOT NULL, `friendRequestSentIds` TEXT NOT NULL, `followingIds` TEXT NOT NULL, `userName` TEXT NOT NULL, `hasStripeAccount` INTEGER, `uploadedImages` TEXT NOT NULL, `profileImageId` TEXT, `privacyDisplayName` TEXT, `isMinor` INTEGER NOT NULL, `isIdentityHidden` INTEGER NOT NULL, `id` TEXT NOT NULL, PRIMARY KEY(`id`))",
    "CREATE TABLE `Team` (`division` TEXT NOT NULL, `name` TEXT, `captainId` TEXT NOT NULL, `managerId` TEXT, `headCoachId` TEXT, `coachIds` TEXT NOT NULL, `parentTeamId` TEXT, `playerIds` TEXT NOT NULL, `pending` TEXT NOT NULL, `teamSize` INTEGER NOT NULL, `profileImageId` TEXT, `sport` TEXT, `divisionTypeId` TEXT, `divisionTypeName` TEXT, `skillDivisionTypeId` TEXT, `skillDivisionTypeName` TEXT, `ageDivisionTypeId` TEXT, `ageDivisionTypeName` TEXT, `divisionGender` TEXT, `id` TEXT NOT NULL, PRIMARY KEY(`id`))",
    "CREATE TABLE `ChatGroup` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `userIds` TEXT NOT NULL, `hostId` TEXT NOT NULL, `imageUrl` TEXT, `displayName` TEXT NOT NULL, PRIMARY KEY(`id`))",
    "CREATE TABLE `Event` (`doubleElimination` INTEGER NOT NULL, `winnerSetCount` INTEGER NOT NULL, `loserSetCount` INTEGER NOT NULL, `winnerBracketPointsToVictory` TEXT NOT NULL, `loserBracketPointsToVictory` TEXT NOT NULL, `prize` TEXT NOT NULL, `id` TEXT NOT NULL, `name` TEXT NOT NULL, `description` TEXT NOT NULL, `divisions` TEXT NOT NULL, `divisionDetails` TEXT NOT NULL, `location` TEXT NOT NULL, `address` TEXT, `start` INTEGER NOT NULL, `end` INTEGER NOT NULL, `priceCents` INTEGER NOT NULL, `rating` REAL, `imageId` TEXT NOT NULL, `coordinates` TEXT NOT NULL, `hostId` TEXT NOT NULL, `assistantHostIds` TEXT NOT NULL, `noFixedEndDateTime` INTEGER NOT NULL, `teamSignup` INTEGER NOT NULL, `singleDivision` INTEGER NOT NULL, `freeAgentIds` TEXT NOT NULL, `waitListIds` TEXT NOT NULL, `userIds` TEXT NOT NULL, `teamIds` TEXT NOT NULL, `cancellationRefundHours` INTEGER NOT NULL, `registrationCutoffHours` INTEGER NOT NULL, `seedColor` INTEGER NOT NULL, `sportId` TEXT, `timeSlotIds` TEXT NOT NULL, `fieldIds` TEXT NOT NULL, `leagueScoringConfigId` TEXT, `organizationId` TEXT, `autoCancellation` INTEGER NOT NULL, `maxParticipants` INTEGER NOT NULL, `minAge` INTEGER, `maxAge` INTEGER, `teamSizeLimit` INTEGER NOT NULL, `registrationByDivisionType` INTEGER NOT NULL, `eventType` TEXT NOT NULL, `fieldCount` INTEGER, `gamesPerOpponent` INTEGER, `includePlayoffs` INTEGER NOT NULL, `playoffTeamCount` INTEGER, `usesSets` INTEGER NOT NULL, `matchDurationMinutes` INTEGER, `setDurationMinutes` INTEGER, `setsPerMatch` INTEGER, `doTeamsOfficiate` INTEGER, `teamOfficialsMaySwap` INTEGER, `restTimeMinutes` INTEGER, `state` TEXT NOT NULL, `pointsToVictory` TEXT NOT NULL, `officialSchedulingMode` TEXT NOT NULL, `officialPositions` TEXT NOT NULL, `eventOfficials` TEXT NOT NULL, `officialIds` TEXT NOT NULL, `allowPaymentPlans` INTEGER, `installmentCount` INTEGER, `installmentDueDates` TEXT NOT NULL, `installmentAmounts` TEXT NOT NULL, `allowTeamSplitDefault` INTEGER, `requiredTemplateIds` TEXT NOT NULL, `lastUpdated` INTEGER NOT NULL, PRIMARY KEY(`id`))",
    "CREATE TABLE `Field` (`fieldNumber` INTEGER NOT NULL, `divisions` TEXT NOT NULL, `lat` REAL, `long` REAL, `heading` REAL, `inUse` INTEGER, `name` TEXT, `rentalSlotIds` TEXT NOT NULL, `location` TEXT, `organizationId` TEXT, `id` TEXT NOT NULL, PRIMARY KEY(`id`))",
    "CREATE TABLE `MatchMVP` (`matchId` INTEGER NOT NULL, `team1Id` TEXT, `team2Id` TEXT, `team1Seed` INTEGER, `team2Seed` INTEGER, `eventId` TEXT NOT NULL, `officialId` TEXT, `fieldId` TEXT, `start` INTEGER, `end` INTEGER, `division` TEXT, `team1Points` TEXT NOT NULL, `team2Points` TEXT NOT NULL, `setResults` TEXT NOT NULL, `side` TEXT, `losersBracket` INTEGER NOT NULL, `winnerNextMatchId` TEXT, `loserNextMatchId` TEXT, `previousLeftId` TEXT, `previousRightId` TEXT, `officialCheckedIn` INTEGER, `officialIds` TEXT NOT NULL, `teamOfficialId` TEXT, `locked` INTEGER NOT NULL, `id` TEXT NOT NULL, PRIMARY KEY(`id`))",
    "CREATE TABLE `MessageMVP` (`id` TEXT NOT NULL, `userId` TEXT NOT NULL, `body` TEXT NOT NULL, `attachmentUrls` TEXT NOT NULL, `chatId` TEXT NOT NULL, `readByIds` TEXT NOT NULL, `sentTime` INTEGER NOT NULL, PRIMARY KEY(`id`))",
    "CREATE TABLE `RefundRequest` (`id` TEXT NOT NULL, `eventId` TEXT NOT NULL, `userId` TEXT NOT NULL, `hostId` TEXT, `reason` TEXT NOT NULL, `organizationId` TEXT, `status` TEXT, PRIMARY KEY(`id`))",
    "CREATE TABLE `team_user_cross_ref` (`teamId` TEXT NOT NULL, `userId` TEXT NOT NULL, PRIMARY KEY(`teamId`, `userId`), FOREIGN KEY(`teamId`) REFERENCES `Team`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE, FOREIGN KEY(`userId`) REFERENCES `UserData`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE)",
    "CREATE INDEX `index_team_user_cross_ref_teamId` ON `team_user_cross_ref` (`teamId`)",
    "CREATE INDEX `index_team_user_cross_ref_userId` ON `team_user_cross_ref` (`userId`)",
    "CREATE TABLE `team_pending_player_cross_ref` (`teamId` TEXT NOT NULL, `userId` TEXT NOT NULL, PRIMARY KEY(`teamId`, `userId`), FOREIGN KEY(`teamId`) REFERENCES `Team`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE, FOREIGN KEY(`userId`) REFERENCES `UserData`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE)",
    "CREATE INDEX `index_team_pending_player_cross_ref_teamId` ON `team_pending_player_cross_ref` (`teamId`)",
    "CREATE INDEX `index_team_pending_player_cross_ref_userId` ON `team_pending_player_cross_ref` (`userId`)",
    "CREATE TABLE `event_team_cross_ref` (`teamId` TEXT NOT NULL, `eventId` TEXT NOT NULL, PRIMARY KEY(`teamId`, `eventId`), FOREIGN KEY(`teamId`) REFERENCES `Team`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE, FOREIGN KEY(`eventId`) REFERENCES `Event`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE)",
    "CREATE INDEX `index_event_team_cross_ref_teamId` ON `event_team_cross_ref` (`teamId`)",
    "CREATE INDEX `index_event_team_cross_ref_eventId` ON `event_team_cross_ref` (`eventId`)",
    "CREATE TABLE `user_event_cross_ref` (`userId` TEXT NOT NULL, `eventId` TEXT NOT NULL, PRIMARY KEY(`userId`, `eventId`), FOREIGN KEY(`userId`) REFERENCES `UserData`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE, FOREIGN KEY(`eventId`) REFERENCES `Event`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE)",
    "CREATE INDEX `index_user_event_cross_ref_userId` ON `user_event_cross_ref` (`userId`)",
    "CREATE INDEX `index_user_event_cross_ref_eventId` ON `user_event_cross_ref` (`eventId`)",
    "CREATE TABLE `chat_user_cross_ref` (`chatId` TEXT NOT NULL, `userId` TEXT NOT NULL, PRIMARY KEY(`chatId`, `userId`), FOREIGN KEY(`chatId`) REFERENCES `ChatGroup`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE, FOREIGN KEY(`userId`) REFERENCES `UserData`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE)",
    "CREATE INDEX `index_chat_user_cross_ref_chatId` ON `chat_user_cross_ref` (`chatId`)",
    "CREATE INDEX `index_chat_user_cross_ref_userId` ON `chat_user_cross_ref` (`userId`)",
)

private fun migrateLegacyRowsToV7(profile: LegacySourceProfile): List<String> {
    val users = legacyArchiveName(profile, "UserData")
    val teams = legacyArchiveName(profile, "Team")
    val chats = legacyArchiveName(profile, "ChatGroup")
    val eventImp = legacyArchiveName(profile, "EventImp")
    val tournaments = legacyArchiveName(profile, "Tournament")
    val fields = legacyArchiveName(profile, "Field")
    val matches = legacyArchiveName(profile, "MatchMVP")
    val messages = legacyArchiveName(profile, "MessageMVP")
    val hasStripeAccount = when (profile.stripeColumn) {
        LegacyStripeColumn.HAS_STRIPE_ACCOUNT -> "u.`hasStripeAccount`"
        LegacyStripeColumn.ACCOUNT_ID -> "CASE WHEN u.`accountId` IS NULL OR TRIM(u.`accountId`) = '' THEN 0 ELSE 1 END"
        LegacyStripeColumn.STRIPE_ACCOUNT_ID -> "CASE WHEN u.`stripeAccountId` IS NULL OR TRIM(u.`stripeAccountId`) = '' THEN 0 ELSE 1 END"
        LegacyStripeColumn.NONE -> "NULL"
    }
    val friendRequestIds = if (profile.hasFriendRequestFields) "u.`friendRequestIds`" else "'[]'"
    val friendRequestSentIds = if (profile.hasFriendRequestFields) "u.`friendRequestSentIds`" else "'[]'"
    val followingIds = if (profile.hasFriendRequestFields) "u.`followingIds`" else "'[]'"
    val uploadedImages = if (profile.hasUploadedImages) "u.`uploadedImages`" else "'[]'"
    val userProfileImage = profile.userProfileImageColumn?.let { "u.`$it`" } ?: "NULL"
    val teamProfileImage = profile.teamProfileImageColumn?.let { "t.`$it`" } ?: "NULL"
    val chatImageUrl = if (profile.chatHasImageFields) "c.`imageUrl`" else "NULL"
    val chatDisplayName = if (profile.chatHasImageFields) "c.`displayName`" else "c.`name`"
    val eventPlayerIds = if (profile.hasParticipantIds) {
        "e.`playerIds`"
    } else {
        legacyJsonArray(
            legacyArchiveName(profile, "user_event_cross_ref"),
            valueColumn = "userId",
            sourceColumn = "eventId",
            sourceAlias = "e",
        )
    }
    val eventTeamIds = if (profile.hasParticipantIds) "e.`teamIds`" else legacyJsonArray(
        legacyArchiveName(profile, "event_team_cross_ref"),
        valueColumn = "teamId",
        sourceColumn = "eventId",
        sourceAlias = "e",
    )
    val tournamentPlayerIds = if (profile.hasParticipantIds) {
        "t.`playerIds`"
    } else {
        legacyJsonArray(
            legacyArchiveName(profile, "user_tournament_cross_ref"),
            valueColumn = "userId",
            sourceColumn = "tournamentId",
            sourceAlias = "t",
        )
    }
    val tournamentTeamIds = if (profile.hasParticipantIds) "t.`teamIds`" else legacyJsonArray(
        legacyArchiveName(profile, "tournament_team_cross_ref"),
        valueColumn = "teamId",
        sourceColumn = "tournamentId",
        sourceAlias = "t",
    )
    val eventCancellationHours = if (profile.hasCancellationRefundHours) "e.`cancellationRefundHours`" else "0"
    val eventCutoffHours = if (profile.hasRegistrationCutoffHours) "e.`registrationCutoffHours`" else "0"
    val eventSeedColor = if (profile.hasSeedColor) "e.`seedColor`" else "-9781761"
    val tournamentCancellationHours = if (profile.hasCancellationRefundHours) "t.`cancellationRefundHours`" else "0"
    val tournamentCutoffHours = if (profile.hasRegistrationCutoffHours) "t.`registrationCutoffHours`" else "0"
    val tournamentSeedColor = if (profile.hasSeedColor) "t.`seedColor`" else "-9781761"
    val tournamentPrize = if (profile.hasTournamentPrize) "t.`prize`" else "''"

    val baseStatements = listOf<String>(
        """
        INSERT INTO `UserData` (`firstName`, `lastName`, `teamIds`, `friendIds`, `friendRequestIds`, `friendRequestSentIds`, `followingIds`, `userName`, `hasStripeAccount`, `uploadedImages`, `profileImageId`, `privacyDisplayName`, `isMinor`, `isIdentityHidden`, `id`)
        SELECT u.`firstName`, u.`lastName`, u.`teamIds`, u.`friendIds`, $friendRequestIds, $friendRequestSentIds, $followingIds, u.`userName`, $hasStripeAccount, $uploadedImages, $userProfileImage, NULL, 0, 0, u.`id`
        FROM `$users` u
        """.trimIndent(),
        """
        INSERT INTO `Team` (`division`, `name`, `captainId`, `managerId`, `headCoachId`, `coachIds`, `parentTeamId`, `playerIds`, `pending`, `teamSize`, `profileImageId`, `sport`, `divisionTypeId`, `divisionTypeName`, `skillDivisionTypeId`, `skillDivisionTypeName`, `ageDivisionTypeId`, `ageDivisionTypeName`, `divisionGender`, `id`)
        SELECT t.`division`, t.`name`, t.`captainId`, NULL, NULL, '[]', NULL, t.`${profile.teamPlayerColumn}`, t.`pending`, t.`teamSize`, $teamProfileImage, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, t.`id`
        FROM `$teams` t
        """.trimIndent(),
        """
        INSERT INTO `ChatGroup` (`id`, `name`, `userIds`, `hostId`, `imageUrl`, `displayName`)
        SELECT c.`id`, c.`name`, c.`userIds`, c.`hostId`, $chatImageUrl, $chatDisplayName
        FROM `$chats` c
        """.trimIndent(),
        legacyEventImpInsert(
            tableName = eventImp,
            playerIds = eventPlayerIds,
            teamIds = eventTeamIds,
            cancellationHours = eventCancellationHours,
            cutoffHours = eventCutoffHours,
            seedColor = eventSeedColor,
        ),
        legacyTournamentInsert(
            tableName = tournaments,
            prize = tournamentPrize,
            playerIds = tournamentPlayerIds,
            teamIds = tournamentTeamIds,
            cancellationHours = tournamentCancellationHours,
            cutoffHours = tournamentCutoffHours,
            seedColor = tournamentSeedColor,
            fieldIds = legacyJsonArray(
                fields,
                valueColumn = "id",
                sourceColumn = "tournamentId",
                sourceAlias = "t",
            ),
        ),
        """
        INSERT INTO `Field` (`fieldNumber`, `divisions`, `lat`, `long`, `heading`, `inUse`, `name`, `rentalSlotIds`, `location`, `organizationId`, `id`)
        SELECT f.`fieldNumber`, f.`divisions`, NULL, NULL, NULL, f.`inUse`, NULL, '[]', NULL, NULL, f.`id`
        FROM `$fields` f
        """.trimIndent(),
        """
        INSERT INTO `MatchMVP` (`matchId`, `team1Id`, `team2Id`, `team1Seed`, `team2Seed`, `eventId`, `officialId`, `fieldId`, `start`, `end`, `division`, `team1Points`, `team2Points`, `setResults`, `side`, `losersBracket`, `winnerNextMatchId`, `loserNextMatchId`, `previousLeftId`, `previousRightId`, `officialCheckedIn`, `officialIds`, `teamOfficialId`, `locked`, `id`)
        SELECT m.`matchNumber`, m.`team1`, m.`team2`, NULL, NULL, m.`tournamentId`, m.`refId`, m.`field`, m.`start`, m.`end`, m.`division`, m.`team1Points`, m.`team2Points`, m.`setResults`, NULL, m.`losersBracket`, m.`winnerNextMatchId`, m.`loserNextMatchId`, m.`previousLeftMatchId`, m.`previousRightMatchId`, m.`refCheckedIn`, '[]', NULL, 0, m.`id`
        FROM `$matches` m
        """.trimIndent(),
        """
        INSERT INTO `MessageMVP` (`id`, `userId`, `body`, `attachmentUrls`, `chatId`, `readByIds`, `sentTime`)
        SELECT `id`, `userId`, `body`, `attachmentUrls`, `chatId`, `readByIds`, `sentTime`
        FROM `$messages`
        """.trimIndent(),
    )
    val refundStatements: List<String> = if (profile.hasRefundRequest) listOf(
        """
        INSERT INTO `RefundRequest` (`id`, `eventId`, `userId`, `hostId`, `reason`, `organizationId`, `status`)
        SELECT `id`, `eventId`, `userId`, `hostId`, `reason`, NULL, NULL
        FROM `${legacyArchiveName(profile, "RefundRequest")}`
        """.trimIndent(),
    ) else emptyList()

    return baseStatements + refundStatements + legacyCrossReferenceInserts(profile)
}

private fun migrateUnifiedEventRowsToV7(profile: LegacySourceProfile): List<String> {
    val users = legacyArchiveName(profile, "UserData")
    val teams = legacyArchiveName(profile, "Team")
    val chats = legacyArchiveName(profile, "ChatGroup")
    val events = legacyArchiveName(profile, "Event")
    val fields = legacyArchiveName(profile, "Field")
    val matches = legacyArchiveName(profile, "MatchMVP")
    val messages = legacyArchiveName(profile, "MessageMVP")

    return listOf(
        legacyUserInsert(profile, users),
        legacyTeamInsert(profile, teams),
        legacyChatInsert(profile, chats),
        legacyUnifiedEventInsert(profile, events),
        legacyPreModernFieldInsert(fields),
        legacyPreModernMatchInsert(profile, matches),
        legacyMessageInsert(messages),
    ) + legacyRefundInsert(profile) + legacyUnifiedCrossReferenceInserts(profile)
}

private fun migrateModernEventRowsToV7(profile: LegacySourceProfile): List<String> {
    val users = legacyArchiveName(profile, "UserData")
    val teams = legacyArchiveName(profile, "Team")
    val chats = legacyArchiveName(profile, "ChatGroup")
    val events = legacyArchiveName(profile, "Event")
    val fields = legacyArchiveName(profile, "Field")
    val matches = legacyArchiveName(profile, "MatchMVP")
    val messages = legacyArchiveName(profile, "MessageMVP")

    return listOf(
        legacyUserInsert(profile, users),
        legacyTeamInsert(profile, teams),
        legacyChatInsert(profile, chats),
        legacyModernEventInsert(profile, events),
        legacyModernFieldInsert(fields),
        legacyModernMatchInsert(profile, matches),
        legacyMessageInsert(messages),
    ) + legacyRefundInsert(profile) + legacyUnifiedCrossReferenceInserts(profile)
}

private fun legacyUserInsert(profile: LegacySourceProfile, tableName: String): String {
    val hasStripeAccount = legacyStripeExpression(profile, "u")
    val friendRequestIds = if (profile.hasFriendRequestFields) "u.`friendRequestIds`" else "'[]'"
    val friendRequestSentIds = if (profile.hasFriendRequestFields) "u.`friendRequestSentIds`" else "'[]'"
    val followingIds = if (profile.hasFriendRequestFields) "u.`followingIds`" else "'[]'"
    val uploadedImages = if (profile.hasUploadedImages) "u.`uploadedImages`" else "'[]'"
    val profileImage = profile.userProfileImageColumn?.let { "u.`$it`" } ?: "NULL"

    return """
        INSERT INTO `UserData` (`firstName`, `lastName`, `teamIds`, `friendIds`, `friendRequestIds`, `friendRequestSentIds`, `followingIds`, `userName`, `hasStripeAccount`, `uploadedImages`, `profileImageId`, `privacyDisplayName`, `isMinor`, `isIdentityHidden`, `id`)
        SELECT u.`firstName`, u.`lastName`, u.`teamIds`, u.`friendIds`, $friendRequestIds, $friendRequestSentIds, $followingIds, u.`userName`, $hasStripeAccount, $uploadedImages, $profileImage, NULL, 0, 0, u.`id`
        FROM `$tableName` u
    """.trimIndent()
}

private fun legacyStripeExpression(profile: LegacySourceProfile, alias: String): String = when (profile.stripeColumn) {
    LegacyStripeColumn.HAS_STRIPE_ACCOUNT -> "$alias.`hasStripeAccount`"
    LegacyStripeColumn.ACCOUNT_ID -> "CASE WHEN $alias.`accountId` IS NULL OR TRIM($alias.`accountId`) = '' THEN 0 ELSE 1 END"
    LegacyStripeColumn.STRIPE_ACCOUNT_ID -> "CASE WHEN $alias.`stripeAccountId` IS NULL OR TRIM($alias.`stripeAccountId`) = '' THEN 0 ELSE 1 END"
    LegacyStripeColumn.NONE -> "NULL"
}

private fun legacyTeamInsert(profile: LegacySourceProfile, tableName: String): String {
    val managerId = if (profile.teamHasManagerId) "t.`managerId`" else "NULL"
    val headCoachId = if (profile.teamHasHeadCoachId) "t.`headCoachId`" else "NULL"
    val coachIds = if (profile.teamHasCoachIds) "t.`coachIds`" else "'[]'"
    val parentTeamId = if (profile.teamHasParentTeamId) "t.`parentTeamId`" else "NULL"
    val profileImage = profile.teamProfileImageColumn?.let { "t.`$it`" } ?: "NULL"
    val sport = if (profile.teamHasSport) "t.`sport`" else "NULL"
    val divisionTypeId = if (profile.teamHasDivisionMetadata) "t.`divisionTypeId`" else "NULL"
    val divisionTypeName = if (profile.teamHasDivisionMetadata) "t.`divisionTypeName`" else "NULL"
    val skillDivisionTypeId = if (profile.teamHasDivisionMetadata) "t.`skillDivisionTypeId`" else "NULL"
    val skillDivisionTypeName = if (profile.teamHasDivisionMetadata) "t.`skillDivisionTypeName`" else "NULL"
    val ageDivisionTypeId = if (profile.teamHasDivisionMetadata) "t.`ageDivisionTypeId`" else "NULL"
    val ageDivisionTypeName = if (profile.teamHasDivisionMetadata) "t.`ageDivisionTypeName`" else "NULL"
    val divisionGender = if (profile.teamHasDivisionMetadata) "t.`divisionGender`" else "NULL"

    return """
        INSERT INTO `Team` (`division`, `name`, `captainId`, `managerId`, `headCoachId`, `coachIds`, `parentTeamId`, `playerIds`, `pending`, `teamSize`, `profileImageId`, `sport`, `divisionTypeId`, `divisionTypeName`, `skillDivisionTypeId`, `skillDivisionTypeName`, `ageDivisionTypeId`, `ageDivisionTypeName`, `divisionGender`, `id`)
        SELECT t.`division`, t.`name`, t.`captainId`, $managerId, $headCoachId, $coachIds, $parentTeamId, t.`${profile.teamPlayerColumn}`, t.`pending`, t.`teamSize`, $profileImage, $sport, $divisionTypeId, $divisionTypeName, $skillDivisionTypeId, $skillDivisionTypeName, $ageDivisionTypeId, $ageDivisionTypeName, $divisionGender, t.`id`
        FROM `$tableName` t
    """.trimIndent()
}

private fun legacyChatInsert(profile: LegacySourceProfile, tableName: String): String {
    val imageUrl = if (profile.chatHasImageFields) "c.`imageUrl`" else "NULL"
    val displayName = if (profile.chatHasImageFields) "c.`displayName`" else "c.`name`"

    return """
        INSERT INTO `ChatGroup` (`id`, `name`, `userIds`, `hostId`, `imageUrl`, `displayName`)
        SELECT c.`id`, c.`name`, c.`userIds`, c.`hostId`, $imageUrl, $displayName
        FROM `$tableName` c
    """.trimIndent()
}

private fun legacyUnifiedEventInsert(profile: LegacySourceProfile, tableName: String): String {
    val divisionDetails = if (profile.eventHasDivisionDetails) "e.`divisionDetails`" else "'[]'"
    val noFixedEndDateTime = if (profile.eventHasNoFixedEndDateTime) "e.`noFixedEndDateTime`" else "0"
    val assistantHostIds = if (profile.eventHasAssistantHostIds) "e.`assistantHostIds`" else "'[]'"
    val doTeamsOfficiate = if (profile.eventUsesDoTeamsRef) "e.`doTeamsRef`" else "NULL"
    val teamOfficialsMaySwap = profile.eventTeamOfficialsMaySwapSourceColumn
        ?.let { sourceColumn -> "e.`$sourceColumn`" }
        ?: "NULL"

    return """
        INSERT INTO `Event` (`doubleElimination`, `winnerSetCount`, `loserSetCount`, `winnerBracketPointsToVictory`, `loserBracketPointsToVictory`, `prize`, `id`, `name`, `description`, `divisions`, `divisionDetails`, `location`, `address`, `start`, `end`, `priceCents`, `rating`, `imageId`, `coordinates`, `hostId`, `assistantHostIds`, `noFixedEndDateTime`, `teamSignup`, `singleDivision`, `freeAgentIds`, `waitListIds`, `userIds`, `teamIds`, `cancellationRefundHours`, `registrationCutoffHours`, `seedColor`, `sportId`, `timeSlotIds`, `fieldIds`, `leagueScoringConfigId`, `organizationId`, `autoCancellation`, `maxParticipants`, `minAge`, `maxAge`, `teamSizeLimit`, `registrationByDivisionType`, `eventType`, `fieldCount`, `gamesPerOpponent`, `includePlayoffs`, `playoffTeamCount`, `usesSets`, `matchDurationMinutes`, `setDurationMinutes`, `setsPerMatch`, `doTeamsOfficiate`, `teamOfficialsMaySwap`, `restTimeMinutes`, `state`, `pointsToVictory`, `officialSchedulingMode`, `officialPositions`, `eventOfficials`, `officialIds`, `allowPaymentPlans`, `installmentCount`, `installmentDueDates`, `installmentAmounts`, `allowTeamSplitDefault`, `requiredTemplateIds`, `lastUpdated`)
        SELECT e.`doubleElimination`, e.`winnerSetCount`, e.`loserSetCount`, e.`winnerBracketPointsToVictory`, e.`loserBracketPointsToVictory`, e.`prize`, e.`id`, e.`name`, e.`description`, e.`divisions`, $divisionDetails, e.`location`, NULL, e.`start`, e.`end`, CAST(ROUND(e.`price` * 100.0) AS INTEGER), e.`rating`, COALESCE(e.`imageId`, ''), e.`coordinates`, e.`hostId`, $assistantHostIds, $noFixedEndDateTime, e.`teamSignup`, e.`singleDivision`, e.`freeAgentIds`, e.`waitListIds`, e.`userIds`, e.`teamIds`, e.`cancellationRefundHours`, e.`registrationCutoffHours`, e.`seedColor`, e.`sportId`, e.`timeSlotIds`, e.`fieldIds`, e.`leagueScoringConfigId`, e.`organizationId`, e.`autoCancellation`, e.`maxParticipants`, NULL, NULL, e.`teamSizeLimit`, 0, e.`eventType`, e.`fieldCount`, e.`gamesPerOpponent`, e.`includePlayoffs`, e.`playoffTeamCount`, e.`usesSets`, e.`matchDurationMinutes`, e.`setDurationMinutes`, e.`setsPerMatch`, $doTeamsOfficiate, $teamOfficialsMaySwap, e.`restTimeMinutes`, e.`state`, e.`pointsToVictory`, 'SCHEDULE', '[]', '[]', '[]', NULL, NULL, '[]', '[]', NULL, '[]', e.`lastUpdated`
        FROM `$tableName` e
    """.trimIndent()
}

private fun legacyModernEventInsert(profile: LegacySourceProfile, tableName: String): String {
    val divisionDetails = if (profile.eventHasDivisionDetails) "e.`divisionDetails`" else "'[]'"
    val noFixedEndDateTime = if (profile.eventHasNoFixedEndDateTime) "e.`noFixedEndDateTime`" else "0"
    val assistantHostIds = if (profile.eventHasAssistantHostIds) "e.`assistantHostIds`" else "'[]'"
    val teamOfficialsMaySwap = profile.eventTeamOfficialsMaySwapSourceColumn
        ?.let { sourceColumn -> "e.`$sourceColumn`" }
        ?: "NULL"

    return """
        INSERT INTO `Event` (`doubleElimination`, `winnerSetCount`, `loserSetCount`, `winnerBracketPointsToVictory`, `loserBracketPointsToVictory`, `prize`, `id`, `name`, `description`, `divisions`, `divisionDetails`, `location`, `address`, `start`, `end`, `priceCents`, `rating`, `imageId`, `coordinates`, `hostId`, `assistantHostIds`, `noFixedEndDateTime`, `teamSignup`, `singleDivision`, `freeAgentIds`, `waitListIds`, `userIds`, `teamIds`, `cancellationRefundHours`, `registrationCutoffHours`, `seedColor`, `sportId`, `timeSlotIds`, `fieldIds`, `leagueScoringConfigId`, `organizationId`, `autoCancellation`, `maxParticipants`, `minAge`, `maxAge`, `teamSizeLimit`, `registrationByDivisionType`, `eventType`, `fieldCount`, `gamesPerOpponent`, `includePlayoffs`, `playoffTeamCount`, `usesSets`, `matchDurationMinutes`, `setDurationMinutes`, `setsPerMatch`, `doTeamsOfficiate`, `teamOfficialsMaySwap`, `restTimeMinutes`, `state`, `pointsToVictory`, `officialSchedulingMode`, `officialPositions`, `eventOfficials`, `officialIds`, `allowPaymentPlans`, `installmentCount`, `installmentDueDates`, `installmentAmounts`, `allowTeamSplitDefault`, `requiredTemplateIds`, `lastUpdated`)
        SELECT e.`doubleElimination`, e.`winnerSetCount`, e.`loserSetCount`, e.`winnerBracketPointsToVictory`, e.`loserBracketPointsToVictory`, e.`prize`, e.`id`, e.`name`, e.`description`, e.`divisions`, $divisionDetails, e.`location`, NULL, e.`start`, e.`end`, e.`priceCents`, e.`rating`, e.`imageId`, e.`coordinates`, e.`hostId`, $assistantHostIds, $noFixedEndDateTime, e.`teamSignup`, e.`singleDivision`, e.`freeAgentIds`, e.`waitListIds`, e.`userIds`, e.`teamIds`, e.`cancellationRefundHours`, e.`registrationCutoffHours`, e.`seedColor`, e.`sportId`, e.`timeSlotIds`, e.`fieldIds`, e.`leagueScoringConfigId`, e.`organizationId`, e.`autoCancellation`, e.`maxParticipants`, e.`minAge`, e.`maxAge`, e.`teamSizeLimit`, e.`registrationByDivisionType`, e.`eventType`, e.`fieldCount`, e.`gamesPerOpponent`, e.`includePlayoffs`, e.`playoffTeamCount`, e.`usesSets`, e.`matchDurationMinutes`, e.`setDurationMinutes`, e.`setsPerMatch`, e.`doTeamsRef`, $teamOfficialsMaySwap, e.`restTimeMinutes`, e.`state`, e.`pointsToVictory`, 'SCHEDULE', '[]', '[]', e.`refereeIds`, e.`allowPaymentPlans`, e.`installmentCount`, e.`installmentDueDates`, e.`installmentAmounts`, e.`allowTeamSplitDefault`, e.`requiredTemplateIds`, e.`lastUpdated`
        FROM `$tableName` e
    """.trimIndent()
}

private fun legacyPreModernFieldInsert(tableName: String): String =
    """
        INSERT INTO `Field` (`fieldNumber`, `divisions`, `lat`, `long`, `heading`, `inUse`, `name`, `rentalSlotIds`, `location`, `organizationId`, `id`)
        SELECT f.`fieldNumber`, f.`divisions`, NULL, NULL, NULL, f.`inUse`, NULL, '[]', NULL, NULL, f.`id`
        FROM `$tableName` f
    """.trimIndent()

private fun legacyModernFieldInsert(tableName: String): String =
    """
        INSERT INTO `Field` (`fieldNumber`, `divisions`, `lat`, `long`, `heading`, `inUse`, `name`, `rentalSlotIds`, `location`, `organizationId`, `id`)
        SELECT f.`fieldNumber`, f.`divisions`, f.`lat`, f.`long`, f.`heading`, f.`inUse`, f.`name`, f.`rentalSlotIds`, f.`location`, f.`organizationId`, f.`id`
        FROM `$tableName` f
    """.trimIndent()

private fun legacyPreModernMatchInsert(profile: LegacySourceProfile, tableName: String): String =
    """
        INSERT INTO `MatchMVP` (`matchId`, `team1Id`, `team2Id`, `team1Seed`, `team2Seed`, `eventId`, `officialId`, `fieldId`, `start`, `end`, `division`, `team1Points`, `team2Points`, `setResults`, `side`, `losersBracket`, `winnerNextMatchId`, `loserNextMatchId`, `previousLeftId`, `previousRightId`, `officialCheckedIn`, `officialIds`, `teamOfficialId`, `locked`, `id`)
        SELECT m.`matchNumber`, m.`team1`, m.`team2`, NULL, NULL, m.`${profile.matchEventIdColumn}`, m.`refId`, m.`field`, m.`start`, m.`end`, m.`division`, m.`team1Points`, m.`team2Points`, m.`setResults`, NULL, m.`losersBracket`, m.`winnerNextMatchId`, m.`loserNextMatchId`, m.`previousLeftMatchId`, m.`previousRightMatchId`, m.`refCheckedIn`, '[]', NULL, 0, m.`id`
        FROM `$tableName` m
    """.trimIndent()

private fun legacyModernMatchInsert(profile: LegacySourceProfile, tableName: String): String {
    val team1Seed = if (profile.matchHasSeeds) "m.`team1Seed`" else "NULL"
    val team2Seed = if (profile.matchHasSeeds) "m.`team2Seed`" else "NULL"
    val locked = if (profile.matchHasLocked) "m.`locked`" else "0"

    return """
        INSERT INTO `MatchMVP` (`matchId`, `team1Id`, `team2Id`, `team1Seed`, `team2Seed`, `eventId`, `officialId`, `fieldId`, `start`, `end`, `division`, `team1Points`, `team2Points`, `setResults`, `side`, `losersBracket`, `winnerNextMatchId`, `loserNextMatchId`, `previousLeftId`, `previousRightId`, `officialCheckedIn`, `officialIds`, `teamOfficialId`, `locked`, `id`)
        SELECT m.`matchId`, m.`team1Id`, m.`team2Id`, $team1Seed, $team2Seed, m.`eventId`, m.`refereeId`, m.`fieldId`, m.`start`, m.`end`, m.`division`, m.`team1Points`, m.`team2Points`, m.`setResults`, m.`side`, m.`losersBracket`, m.`winnerNextMatchId`, m.`loserNextMatchId`, m.`previousLeftId`, m.`previousRightId`, m.`refereeCheckedIn`, '[]', m.`teamRefereeId`, $locked, m.`id`
        FROM `$tableName` m
    """.trimIndent()
}

private fun legacyMessageInsert(tableName: String): String =
    """
        INSERT INTO `MessageMVP` (`id`, `userId`, `body`, `attachmentUrls`, `chatId`, `readByIds`, `sentTime`)
        SELECT `id`, `userId`, `body`, `attachmentUrls`, `chatId`, `readByIds`, `sentTime`
        FROM `$tableName`
    """.trimIndent()

private fun legacyRefundInsert(profile: LegacySourceProfile): List<String> {
    if (!profile.hasRefundRequest) return emptyList()

    val refunds = legacyArchiveName(profile, "RefundRequest")
    val organizationId = if (profile.family == LegacySchemaFamily.MODERN_EVENT) "r.`organizationId`" else "NULL"
    val status = if (profile.family == LegacySchemaFamily.MODERN_EVENT) "r.`status`" else "NULL"
    return listOf(
        """
        INSERT INTO `RefundRequest` (`id`, `eventId`, `userId`, `hostId`, `reason`, `organizationId`, `status`)
        SELECT r.`id`, r.`eventId`, r.`userId`, r.`hostId`, r.`reason`, $organizationId, $status
        FROM `$refunds` r
        """.trimIndent(),
    )
}

private fun legacyUnifiedCrossReferenceInserts(profile: LegacySourceProfile): List<String> {
    val teamUser = legacyArchiveName(profile, "team_user_cross_ref")
    val teamPending = legacyArchiveName(profile, "team_pending_player_cross_ref")
    val chatUser = legacyArchiveName(profile, "chat_user_cross_ref")
    val eventTeam = legacyArchiveName(profile, "event_team_cross_ref")
    val userEvent = legacyArchiveName(profile, "user_event_cross_ref")

    return listOf(
        "INSERT OR IGNORE INTO `team_user_cross_ref` (`teamId`, `userId`) SELECT r.`teamId`, r.`userId` FROM `$teamUser` r INNER JOIN `Team` t ON t.`id` = r.`teamId` INNER JOIN `UserData` u ON u.`id` = r.`userId`",
        "INSERT OR IGNORE INTO `team_pending_player_cross_ref` (`teamId`, `userId`) SELECT r.`teamId`, r.`userId` FROM `$teamPending` r INNER JOIN `Team` t ON t.`id` = r.`teamId` INNER JOIN `UserData` u ON u.`id` = r.`userId`",
        "INSERT OR IGNORE INTO `chat_user_cross_ref` (`chatId`, `userId`) SELECT r.`chatId`, r.`userId` FROM `$chatUser` r INNER JOIN `ChatGroup` c ON c.`id` = r.`chatId` INNER JOIN `UserData` u ON u.`id` = r.`userId`",
        "INSERT OR IGNORE INTO `event_team_cross_ref` (`teamId`, `eventId`) SELECT r.`teamId`, r.`eventId` FROM `$eventTeam` r INNER JOIN `Team` t ON t.`id` = r.`teamId` INNER JOIN `Event` e ON e.`id` = r.`eventId`",
        "INSERT OR IGNORE INTO `user_event_cross_ref` (`userId`, `eventId`) SELECT r.`userId`, r.`eventId` FROM `$userEvent` r INNER JOIN `UserData` u ON u.`id` = r.`userId` INNER JOIN `Event` e ON e.`id` = r.`eventId`",
    )
}

private fun legacyJsonArray(
    tableName: String,
    valueColumn: String,
    sourceColumn: String,
    sourceAlias: String,
): String =
    "COALESCE((SELECT '[' || group_concat('\"' || r.`$valueColumn` || '\"') || ']' FROM `$tableName` r WHERE r.`$sourceColumn` = $sourceAlias.`id`), '[]')"

private fun legacyEventImpInsert(
    tableName: String,
    playerIds: String,
    teamIds: String,
    cancellationHours: String,
    cutoffHours: String,
    seedColor: String,
): String =
    """
    INSERT INTO `Event` (`doubleElimination`, `winnerSetCount`, `loserSetCount`, `winnerBracketPointsToVictory`, `loserBracketPointsToVictory`, `prize`, `id`, `name`, `description`, `divisions`, `divisionDetails`, `location`, `address`, `start`, `end`, `priceCents`, `rating`, `imageId`, `coordinates`, `hostId`, `assistantHostIds`, `noFixedEndDateTime`, `teamSignup`, `singleDivision`, `freeAgentIds`, `waitListIds`, `userIds`, `teamIds`, `cancellationRefundHours`, `registrationCutoffHours`, `seedColor`, `sportId`, `timeSlotIds`, `fieldIds`, `leagueScoringConfigId`, `organizationId`, `autoCancellation`, `maxParticipants`, `minAge`, `maxAge`, `teamSizeLimit`, `registrationByDivisionType`, `eventType`, `fieldCount`, `gamesPerOpponent`, `includePlayoffs`, `playoffTeamCount`, `usesSets`, `matchDurationMinutes`, `setDurationMinutes`, `setsPerMatch`, `doTeamsOfficiate`, `teamOfficialsMaySwap`, `restTimeMinutes`, `state`, `pointsToVictory`, `officialSchedulingMode`, `officialPositions`, `eventOfficials`, `officialIds`, `allowPaymentPlans`, `installmentCount`, `installmentDueDates`, `installmentAmounts`, `allowTeamSplitDefault`, `requiredTemplateIds`, `lastUpdated`)
    SELECT 0, 1, 0, '[]', '[]', '', e.`id`, e.`name`, e.`description`, e.`divisions`, '[]', e.`location`, NULL, e.`start`, e.`end`, CAST(ROUND(e.`price` * 100.0) AS INTEGER), e.`rating`, '', printf('[%f,%f]', e.`long`, e.`lat`), e.`hostId`, '[]', 0, e.`teamSignup`, e.`singleDivision`, e.`freeAgents`, e.`waitList`, $playerIds, $teamIds, $cancellationHours, $cutoffHours, $seedColor, NULL, '[]', '[]', NULL, NULL, 0, e.`maxParticipants`, NULL, NULL, e.`teamSizeLimit`, 0, 'EVENT', NULL, NULL, 0, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, 'PUBLISHED', '[]', 'SCHEDULE', '[]', '[]', '[]', NULL, NULL, '[]', '[]', NULL, '[]', e.`lastUpdated`
    FROM `$tableName` e
    """.trimIndent()

private fun legacyTournamentInsert(
    tableName: String,
    prize: String,
    playerIds: String,
    teamIds: String,
    cancellationHours: String,
    cutoffHours: String,
    seedColor: String,
    fieldIds: String,
): String =
    """
    INSERT INTO `Event` (`doubleElimination`, `winnerSetCount`, `loserSetCount`, `winnerBracketPointsToVictory`, `loserBracketPointsToVictory`, `prize`, `id`, `name`, `description`, `divisions`, `divisionDetails`, `location`, `address`, `start`, `end`, `priceCents`, `rating`, `imageId`, `coordinates`, `hostId`, `assistantHostIds`, `noFixedEndDateTime`, `teamSignup`, `singleDivision`, `freeAgentIds`, `waitListIds`, `userIds`, `teamIds`, `cancellationRefundHours`, `registrationCutoffHours`, `seedColor`, `sportId`, `timeSlotIds`, `fieldIds`, `leagueScoringConfigId`, `organizationId`, `autoCancellation`, `maxParticipants`, `minAge`, `maxAge`, `teamSizeLimit`, `registrationByDivisionType`, `eventType`, `fieldCount`, `gamesPerOpponent`, `includePlayoffs`, `playoffTeamCount`, `usesSets`, `matchDurationMinutes`, `setDurationMinutes`, `setsPerMatch`, `doTeamsOfficiate`, `teamOfficialsMaySwap`, `restTimeMinutes`, `state`, `pointsToVictory`, `officialSchedulingMode`, `officialPositions`, `eventOfficials`, `officialIds`, `allowPaymentPlans`, `installmentCount`, `installmentDueDates`, `installmentAmounts`, `allowTeamSplitDefault`, `requiredTemplateIds`, `lastUpdated`)
    SELECT t.`doubleElimination`, t.`winnerSetCount`, t.`loserSetCount`, t.`winnerBracketPointsToVictory`, t.`loserBracketPointsToVictory`, $prize, t.`id`, t.`name`, t.`description`, t.`divisions`, '[]', t.`location`, NULL, t.`start`, t.`end`, CAST(ROUND(t.`price` * 100.0) AS INTEGER), t.`rating`, '', printf('[%f,%f]', t.`long`, t.`lat`), t.`hostId`, '[]', 0, t.`teamSignup`, t.`singleDivision`, t.`freeAgents`, t.`waitList`, $playerIds, $teamIds, $cancellationHours, $cutoffHours, $seedColor, NULL, '[]', $fieldIds, NULL, NULL, 0, t.`maxParticipants`, NULL, NULL, t.`teamSizeLimit`, 0, 'TOURNAMENT', NULL, NULL, 0, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, 'PUBLISHED', t.`winnerBracketPointsToVictory`, 'SCHEDULE', '[]', '[]', '[]', NULL, NULL, '[]', '[]', NULL, '[]', t.`lastUpdated`
    FROM `$tableName` t
    """.trimIndent()

private fun legacyCrossReferenceInserts(profile: LegacySourceProfile): List<String> {
    val teamUser = legacyArchiveName(profile, "team_user_cross_ref")
    val teamPending = legacyArchiveName(profile, "team_pending_player_cross_ref")
    val chatUser = legacyArchiveName(profile, "chat_user_cross_ref")
    val eventTeam = legacyArchiveName(profile, "event_team_cross_ref")
    val tournamentTeam = legacyArchiveName(profile, "tournament_team_cross_ref")
    val userEvent = legacyArchiveName(profile, "user_event_cross_ref")
    val userTournament = legacyArchiveName(profile, "user_tournament_cross_ref")

    return listOf(
        "INSERT OR IGNORE INTO `team_user_cross_ref` (`teamId`, `userId`) SELECT r.`teamId`, r.`userId` FROM `$teamUser` r INNER JOIN `Team` t ON t.`id` = r.`teamId` INNER JOIN `UserData` u ON u.`id` = r.`userId`",
        "INSERT OR IGNORE INTO `team_pending_player_cross_ref` (`teamId`, `userId`) SELECT r.`teamId`, r.`userId` FROM `$teamPending` r INNER JOIN `Team` t ON t.`id` = r.`teamId` INNER JOIN `UserData` u ON u.`id` = r.`userId`",
        "INSERT OR IGNORE INTO `chat_user_cross_ref` (`chatId`, `userId`) SELECT r.`chatId`, r.`userId` FROM `$chatUser` r INNER JOIN `ChatGroup` c ON c.`id` = r.`chatId` INNER JOIN `UserData` u ON u.`id` = r.`userId`",
        "INSERT OR IGNORE INTO `event_team_cross_ref` (`teamId`, `eventId`) SELECT r.`teamId`, r.`eventId` FROM `$eventTeam` r INNER JOIN `Team` t ON t.`id` = r.`teamId` INNER JOIN `Event` e ON e.`id` = r.`eventId`",
        "INSERT OR IGNORE INTO `event_team_cross_ref` (`teamId`, `eventId`) SELECT r.`teamId`, r.`tournamentId` FROM `$tournamentTeam` r INNER JOIN `Team` t ON t.`id` = r.`teamId` INNER JOIN `Event` e ON e.`id` = r.`tournamentId`",
        "INSERT OR IGNORE INTO `user_event_cross_ref` (`userId`, `eventId`) SELECT r.`userId`, r.`eventId` FROM `$userEvent` r INNER JOIN `UserData` u ON u.`id` = r.`userId` INNER JOIN `Event` e ON e.`id` = r.`eventId`",
        "INSERT OR IGNORE INTO `user_event_cross_ref` (`userId`, `eventId`) SELECT r.`userId`, r.`tournamentId` FROM `$userTournament` r INNER JOIN `UserData` u ON u.`id` = r.`userId` INNER JOIN `Event` e ON e.`id` = r.`tournamentId`",
    )
}

/**
 * Each version below has an exported schema or a directly evidenced final delta. Versions 56-58
 * were never declared as Room database targets; the sequence jumped from 55 to 59. Versions 88
 * and 89 are reconstructed from the retained 87-to-88 seed and 88-to-89 team-official-swap
 * migration source so devices upgraded during that window are not stranded.
 */
private val legacySourceProfiles = listOf(
    legacyV50Profile,
    legacyV51Profile,
    legacyV52Profile,
    legacyV53Profile,
    legacyV54Profile,
    legacyV55Profile,
    legacyV59Profile,
    legacyV60Profile,
    legacyV61Profile,
    legacyV62Profile,
    legacyV63Profile,
    legacyV64Profile,
    legacyV65Profile,
    legacyV66Profile,
    legacyV67Profile,
    legacyV68Profile,
    legacyV69Profile,
    legacyV70Profile,
    legacyV71Profile,
    legacyV72Profile,
    legacyV73Profile,
    legacyV74Profile,
    legacyV75Profile,
    legacyV76Profile,
    legacyV77Profile,
    legacyV78Profile,
    legacyV79Profile,
    legacyV80Profile,
    legacyV81Profile,
    legacyV82Profile,
    legacyV83Profile,
    legacyV84Profile,
    legacyV85Profile,
    legacyV86Profile,
    legacyV87Profile,
    legacyV88Profile,
    legacyV89Profile,
)

val LEGACY_DATABASE_MIGRATIONS: Array<Migration> =
    legacySourceProfiles.map(::legacyBridgeMigration).toTypedArray()
