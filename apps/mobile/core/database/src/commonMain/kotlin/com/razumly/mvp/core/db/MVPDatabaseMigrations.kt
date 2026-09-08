package com.razumly.mvp.core.db

import androidx.room.migration.Migration
import androidx.sqlite.SQLiteConnection

/**
 * Replaces the removed persisted Affiliate event type with the supported Event type.
 */
val MVP_DATABASE_MIGRATION_107_108 = object : Migration(107, 108) {
    override fun migrate(connection: SQLiteConnection) {
        connection.prepare(
            "UPDATE Event SET eventType = 'EVENT' WHERE eventType = 'AFFILIATE'",
        ).use { statement ->
            statement.step()
        }
    }
}
