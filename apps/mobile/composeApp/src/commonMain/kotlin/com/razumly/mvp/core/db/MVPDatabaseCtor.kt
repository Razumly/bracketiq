package com.razumly.mvp.core.db

import androidx.room.RoomDatabaseConstructor

@Suppress("KotlinNoActualForExpect", "NO_ACTUAL_FOR_EXPECT")
expect object MVPDatabaseCtor : RoomDatabaseConstructor<MVPDatabaseService> {
    override fun initialize(): MVPDatabaseService
}
