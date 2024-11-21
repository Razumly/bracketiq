package com.razumly.mvp.core.data

import android.content.Context
import androidx.room.Room
import androidx.sqlite.driver.bundled.BundledSQLiteDriver

fun getTournamentDatabase(context: Context): TournamentDatabase {
    val dbFile = context.getDatabasePath("tournament.db")
    return Room.databaseBuilder<TournamentDatabase>(
        context.applicationContext,
        dbFile.absolutePath
    )
        .setDriver(BundledSQLiteDriver())
        .fallbackToDestructiveMigration(false)
        .build()
}