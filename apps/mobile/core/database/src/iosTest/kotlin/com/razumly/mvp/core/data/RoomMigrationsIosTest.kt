package com.razumly.mvp.core.data

import androidx.sqlite.SQLiteConnection
import androidx.sqlite.SQLiteStatement
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_LEGACY_UNKNOWN_PAYER_ID
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_STATUS_REJECTED
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.use

class RoomMigrationsIosTest {
    @Test
    fun givenV32Rows_whenMigratedToV90_thenPreservesOutboxAndQuarantinesUnknownPayer() {
        BundledSQLiteDriver().open(":memory:").use { connection ->
            connection.execute(
                """
                CREATE TABLE `RefundRequest` (
                    `id` TEXT NOT NULL,
                    `eventId` TEXT NOT NULL,
                    `userId` TEXT NOT NULL,
                    `hostId` TEXT,
                    `reason` TEXT NOT NULL,
                    `organizationId` TEXT,
                    `status` TEXT,
                    PRIMARY KEY(`id`)
                )
                """.trimIndent(),
            )
            connection.execute(
                """
                INSERT INTO `RefundRequest` (`id`, `eventId`, `userId`, `hostId`, `reason`, `organizationId`, `status`)
                VALUES ('refund-1', 'event-1', 'user-1', 'host-1', 'weather', 'org-1', 'PENDING')
                """.trimIndent(),
            )
            connection.execute(
                """
                CREATE TABLE `MatchOperationOutboxEntry` (
                    `id` TEXT NOT NULL,
                    `payloadJson` TEXT NOT NULL,
                    PRIMARY KEY(`id`)
                )
                """.trimIndent(),
            )
            connection.execute(
                "INSERT INTO `MatchOperationOutboxEntry` (`id`, `payloadJson`) VALUES ('outbox-1', '{\"score\":1}')",
            )

            val migrations = IOS_MVP_DATABASE_MIGRATIONS_V32_TO_V90
            assertEquals(listOf(32, 33, 34, 35), migrations.map { it.startVersion })
            assertEquals(listOf(33, 34, 35, 90), migrations.map { it.endVersion })

            migrations[0].migrate(connection)
            migrations[1].migrate(connection)
            connection.execute(
                """
                INSERT INTO `PendingRentalOrder` (
                    `id`, `publicSlug`, `eventId`, `selectionsJson`, `paymentIntentId`,
                    `renterOrganizationId`, `sportId`, `status`, `attemptCount`, `lastError`,
                    `createdAt`, `lastAttemptAt`
                ) VALUES (
                    'pending-1', 'river-city', 'event-1', '[{"fieldId":"court-1"}]', 'pi_123',
                    'org-1', 'volleyball', 'AWAITING_PAYMENT', 3, 'network interrupted',
                    '2026-01-01T00:00:00Z', '2026-01-01T00:02:00Z'
                )
                """.trimIndent(),
            )
            migrations[2].migrate(connection)
            migrations[3].migrate(connection)

            connection.assertSingleRow(
                "SELECT `reason`, `billIds`, `paymentIds`, `currency`, `scopeVersion` FROM `RefundRequest` WHERE `id` = 'refund-1'",
            ) { statement ->
                assertEquals("weather", statement.getText(0))
                assertEquals("[]", statement.getText(1))
                assertEquals("[]", statement.getText(2))
                assertEquals("usd", statement.getText(3))
                assertEquals(1, statement.getInt(4))
            }
            connection.assertSingleRow(
                "SELECT `payloadJson` FROM `MatchOperationOutboxEntry` WHERE `id` = 'outbox-1'",
            ) { statement ->
                assertEquals("{\"score\":1}", statement.getText(0))
            }
            connection.assertSingleRow(
                "SELECT `payerUserId`, `status`, `selectionsJson`, `lastError` FROM `PendingRentalOrder` WHERE `id` = 'pending-1'",
            ) { statement ->
                assertEquals(PENDING_RENTAL_ORDER_LEGACY_UNKNOWN_PAYER_ID, statement.getText(0))
                assertEquals(PENDING_RENTAL_ORDER_STATUS_REJECTED, statement.getText(1))
                assertEquals("[{\"fieldId\":\"court-1\"}]", statement.getText(2))
                assertTrue(statement.getText(3).contains("payer could not be verified"))
            }
        }
    }
}

private fun SQLiteConnection.execute(sql: String) {
    prepare(sql).use { statement ->
        statement.step()
    }
}

private fun SQLiteConnection.assertSingleRow(
    sql: String,
    assertion: (SQLiteStatement) -> Unit,
) {
    prepare(sql).use { statement ->
        assertTrue(statement.step(), "Expected one row for query: $sql")
        assertion(statement)
        assertTrue(!statement.step(), "Expected exactly one row for query: $sql")
    }
}
