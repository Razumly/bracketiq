package com.razumly.mvp.core.data

import androidx.room.migration.Migration
import androidx.sqlite.SQLiteConnection
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_LEGACY_UNKNOWN_PAYER_ID
import kotlin.use

/**
 * The released mobile database is v32. These steps intentionally mirror the Android v32 -> v90
 * path so iOS upgrades preserve locally queued operations instead of recreating tournament.db.
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

private val MIGRATION_32_33_REFUND_SCOPE = migration(
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

private val MIGRATION_33_34_PENDING_RENTAL_ORDERS = migration(
    33,
    34,
    listOf(
        createTableSql("PendingRentalOrder", pendingRentalV34Columns, primaryKey = listOf("id")),
        *pendingRentalIndices.toTypedArray(),
    ),
)

private const val LEGACY_PENDING_RENTAL_RECOVERY_MESSAGE =
    "Pending rental payment was safely rejected after this update because its payer could not be verified. Create a new checkout to retry."

private val MIGRATION_34_35_PENDING_RENTAL_PAYER_SCOPE = migration(
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

private val MIGRATION_35_90_LEGACY_VERSION_CONTINUITY = migration(35, 90, emptyList())

private val MIGRATION_90_91_FIELD_FACILITY_ID = migration(
    90,
    91,
    listOf("ALTER TABLE `Field` ADD COLUMN `facilityId` TEXT"),
)

private val MIGRATION_91_92_ROOM_FIRST_CATALOG_CACHE = migration(
    91,
    92,
    listOf(
        "CREATE TABLE IF NOT EXISTS `catalog_cache_viewer` (`id` TEXT NOT NULL, `viewerKey` TEXT NOT NULL, PRIMARY KEY(`id`))",
        "CREATE TABLE IF NOT EXISTS `catalog_query_cache` (`cacheKey` TEXT NOT NULL, `viewerKey` TEXT NOT NULL, `resourceType` TEXT NOT NULL, `projectionKey` TEXT NOT NULL, `orderedIdsJson` TEXT NOT NULL, `payloadJson` TEXT NOT NULL, `paginationJson` TEXT, `isComplete` INTEGER NOT NULL, PRIMARY KEY(`cacheKey`))",
        "CREATE INDEX IF NOT EXISTS `index_catalog_query_cache_viewerKey` ON `catalog_query_cache` (`viewerKey`)",
        "CREATE INDEX IF NOT EXISTS `index_catalog_query_cache_viewerKey_resourceType_projectionKey` ON `catalog_query_cache` (`viewerKey`, `resourceType`, `projectionKey`)",
        "CREATE TABLE IF NOT EXISTS `organization_cache` (`viewerKey` TEXT NOT NULL, `projectionKey` TEXT NOT NULL, `organizationId` TEXT NOT NULL, `payloadJson` TEXT NOT NULL, PRIMARY KEY(`viewerKey`, `projectionKey`, `organizationId`))",
        "CREATE INDEX IF NOT EXISTS `index_organization_cache_viewerKey` ON `organization_cache` (`viewerKey`)",
        "CREATE TABLE IF NOT EXISTS `product_cache` (`viewerKey` TEXT NOT NULL, `projectionKey` TEXT NOT NULL, `id` TEXT NOT NULL, `organizationId` TEXT NOT NULL, `payloadJson` TEXT NOT NULL, PRIMARY KEY(`viewerKey`, `projectionKey`, `id`))",
        "CREATE INDEX IF NOT EXISTS `index_product_cache_viewerKey` ON `product_cache` (`viewerKey`)",
        "CREATE INDEX IF NOT EXISTS `index_product_cache_viewerKey_projectionKey_organizationId` ON `product_cache` (`viewerKey`, `projectionKey`, `organizationId`)",
        "CREATE TABLE IF NOT EXISTS `organization_reviews_cache` (`cacheKey` TEXT NOT NULL, `viewerKey` TEXT NOT NULL, `organizationId` TEXT NOT NULL, `cursorKey` TEXT NOT NULL, `pageLimit` INTEGER NOT NULL, `payloadJson` TEXT NOT NULL, PRIMARY KEY(`cacheKey`))",
        "CREATE INDEX IF NOT EXISTS `index_organization_reviews_cache_viewerKey` ON `organization_reviews_cache` (`viewerKey`)",
        "CREATE UNIQUE INDEX IF NOT EXISTS `index_organization_reviews_cache_viewerKey_organizationId_cursorKey_pageLimit` ON `organization_reviews_cache` (`viewerKey`, `organizationId`, `cursorKey`, `pageLimit`)",
        "CREATE TABLE IF NOT EXISTS `time_slot_cache` (`viewerKey` TEXT NOT NULL, `projectionKey` TEXT NOT NULL, `id` TEXT NOT NULL, `payloadJson` TEXT NOT NULL, PRIMARY KEY(`viewerKey`, `projectionKey`, `id`))",
        "CREATE INDEX IF NOT EXISTS `index_time_slot_cache_viewerKey` ON `time_slot_cache` (`viewerKey`)",
    ),
)

private val MIGRATION_92_93_CANONICAL_MEMBERSHIP = migration(
    92,
    93,
    listOf(
        "DROP TABLE IF EXISTS `app009_team_user_backup`",
        "CREATE TABLE `app009_team_user_backup` (`teamId` TEXT NOT NULL, `userId` TEXT NOT NULL, PRIMARY KEY(`teamId`, `userId`))",
        "INSERT OR IGNORE INTO `app009_team_user_backup` (`teamId`, `userId`) SELECT relation.`teamId`, relation.`userId` FROM `team_user_cross_ref` relation INNER JOIN `Team` parent ON parent.`id` = relation.`teamId`",
        "INSERT OR IGNORE INTO `app009_team_user_backup` (`teamId`, `userId`) SELECT team.`id`, CAST(member.`value` AS TEXT) FROM `Team` team, json_each(CASE WHEN json_valid(team.`playerIds`) THEN team.`playerIds` ELSE '[]' END) member WHERE json_type(CASE WHEN json_valid(team.`playerIds`) THEN team.`playerIds` ELSE '[]' END) = 'array' AND member.`type` = 'text'",
        "INSERT OR IGNORE INTO `app009_team_user_backup` (`teamId`, `userId`) SELECT team.`id`, user.`id` FROM `UserData` user, json_each(CASE WHEN json_valid(user.`teamIds`) THEN user.`teamIds` ELSE '[]' END) membership, `Team` team WHERE json_type(CASE WHEN json_valid(user.`teamIds`) THEN user.`teamIds` ELSE '[]' END) = 'array' AND membership.`type` = 'text' AND team.`id` = CAST(membership.`value` AS TEXT)",
        "DROP TABLE IF EXISTS `app009_team_pending_backup`",
        "CREATE TABLE `app009_team_pending_backup` (`teamId` TEXT NOT NULL, `userId` TEXT NOT NULL, PRIMARY KEY(`teamId`, `userId`))",
        "INSERT OR IGNORE INTO `app009_team_pending_backup` (`teamId`, `userId`) SELECT relation.`teamId`, relation.`userId` FROM `team_pending_player_cross_ref` relation INNER JOIN `Team` parent ON parent.`id` = relation.`teamId`",
        "INSERT OR IGNORE INTO `app009_team_pending_backup` (`teamId`, `userId`) SELECT team.`id`, CAST(member.`value` AS TEXT) FROM `Team` team, json_each(CASE WHEN json_valid(team.`pending`) THEN team.`pending` ELSE '[]' END) member WHERE json_type(CASE WHEN json_valid(team.`pending`) THEN team.`pending` ELSE '[]' END) = 'array' AND member.`type` = 'text'",
        "DROP TABLE IF EXISTS `app009_chat_user_backup`",
        "CREATE TABLE `app009_chat_user_backup` (`chatId` TEXT NOT NULL, `userId` TEXT NOT NULL, PRIMARY KEY(`chatId`, `userId`))",
        "INSERT OR IGNORE INTO `app009_chat_user_backup` (`chatId`, `userId`) SELECT relation.`chatId`, relation.`userId` FROM `chat_user_cross_ref` relation INNER JOIN `ChatGroup` parent ON parent.`id` = relation.`chatId`",
        "INSERT OR IGNORE INTO `app009_chat_user_backup` (`chatId`, `userId`) SELECT chat.`id`, CAST(member.`value` AS TEXT) FROM `ChatGroup` chat, json_each(CASE WHEN json_valid(chat.`userIds`) THEN chat.`userIds` ELSE '[]' END) member WHERE json_type(CASE WHEN json_valid(chat.`userIds`) THEN chat.`userIds` ELSE '[]' END) = 'array' AND member.`type` = 'text'",
        "DROP TABLE IF EXISTS `team_user_cross_ref_migration_new`",
        "CREATE TABLE `team_user_cross_ref_migration_new` (`teamId` TEXT NOT NULL, `userId` TEXT NOT NULL, PRIMARY KEY(`teamId`, `userId`), FOREIGN KEY(`teamId`) REFERENCES `Team`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE)",
        "INSERT OR IGNORE INTO `team_user_cross_ref_migration_new` (`teamId`, `userId`) SELECT backup.`teamId`, backup.`userId` FROM `app009_team_user_backup` backup INNER JOIN `Team` parent ON parent.`id` = backup.`teamId`",
        "DROP TABLE `team_user_cross_ref`",
        "ALTER TABLE `team_user_cross_ref_migration_new` RENAME TO `team_user_cross_ref`",
        "CREATE INDEX `index_team_user_cross_ref_teamId` ON `team_user_cross_ref` (`teamId`)",
        "CREATE INDEX `index_team_user_cross_ref_userId` ON `team_user_cross_ref` (`userId`)",
        "DROP TABLE IF EXISTS `team_pending_player_cross_ref_migration_new`",
        "CREATE TABLE `team_pending_player_cross_ref_migration_new` (`teamId` TEXT NOT NULL, `userId` TEXT NOT NULL, PRIMARY KEY(`teamId`, `userId`), FOREIGN KEY(`teamId`) REFERENCES `Team`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE)",
        "INSERT OR IGNORE INTO `team_pending_player_cross_ref_migration_new` (`teamId`, `userId`) SELECT backup.`teamId`, backup.`userId` FROM `app009_team_pending_backup` backup INNER JOIN `Team` parent ON parent.`id` = backup.`teamId`",
        "DROP TABLE `team_pending_player_cross_ref`",
        "ALTER TABLE `team_pending_player_cross_ref_migration_new` RENAME TO `team_pending_player_cross_ref`",
        "CREATE INDEX `index_team_pending_player_cross_ref_teamId` ON `team_pending_player_cross_ref` (`teamId`)",
        "CREATE INDEX `index_team_pending_player_cross_ref_userId` ON `team_pending_player_cross_ref` (`userId`)",
        "DROP TABLE IF EXISTS `chat_user_cross_ref_migration_new`",
        "CREATE TABLE `chat_user_cross_ref_migration_new` (`chatId` TEXT NOT NULL, `userId` TEXT NOT NULL, PRIMARY KEY(`chatId`, `userId`), FOREIGN KEY(`chatId`) REFERENCES `ChatGroup`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE)",
        "INSERT OR IGNORE INTO `chat_user_cross_ref_migration_new` (`chatId`, `userId`) SELECT backup.`chatId`, backup.`userId` FROM `app009_chat_user_backup` backup INNER JOIN `ChatGroup` parent ON parent.`id` = backup.`chatId`",
        "DROP TABLE `chat_user_cross_ref`",
        "ALTER TABLE `chat_user_cross_ref_migration_new` RENAME TO `chat_user_cross_ref`",
        "CREATE INDEX `index_chat_user_cross_ref_chatId` ON `chat_user_cross_ref` (`chatId`)",
        "CREATE INDEX `index_chat_user_cross_ref_userId` ON `chat_user_cross_ref` (`userId`)",
        "ALTER TABLE `Team` DROP COLUMN `playerIds`",
        "ALTER TABLE `Team` DROP COLUMN `pending`",
        "ALTER TABLE `ChatGroup` DROP COLUMN `userIds`",
        "ALTER TABLE `UserData` DROP COLUMN `teamIds`",
        "DROP TABLE `app009_team_user_backup`",
        "DROP TABLE `app009_team_pending_backup`",
        "DROP TABLE `app009_chat_user_backup`",
    ),
)

internal val IOS_MVP_DATABASE_MIGRATIONS_V32_TO_V93: Array<Migration> = arrayOf(
    MIGRATION_32_33_REFUND_SCOPE,
    MIGRATION_33_34_PENDING_RENTAL_ORDERS,
    MIGRATION_34_35_PENDING_RENTAL_PAYER_SCOPE,
    MIGRATION_35_90_LEGACY_VERSION_CONTINUITY,
    MIGRATION_90_91_FIELD_FACILITY_ID,
    MIGRATION_91_92_ROOM_FIRST_CATALOG_CACHE,
    MIGRATION_92_93_CANONICAL_MEMBERSHIP,
)
