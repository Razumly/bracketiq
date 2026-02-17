package com.razumly.mvp.core.data

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

val MIGRATION_80_81 = object : Migration(80, 81) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE `Event` DROP COLUMN `fieldType`")
        db.execSQL("ALTER TABLE `Field` DROP COLUMN `type`")
    }
}
