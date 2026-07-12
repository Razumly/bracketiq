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

internal val IOS_MVP_DATABASE_MIGRATIONS_V32_TO_V91: Array<Migration> = arrayOf(
    MIGRATION_32_33_REFUND_SCOPE,
    MIGRATION_33_34_PENDING_RENTAL_ORDERS,
    MIGRATION_34_35_PENDING_RENTAL_PAYER_SCOPE,
    MIGRATION_35_90_LEGACY_VERSION_CONTINUITY,
    MIGRATION_90_91_FIELD_FACILITY_ID,
)
