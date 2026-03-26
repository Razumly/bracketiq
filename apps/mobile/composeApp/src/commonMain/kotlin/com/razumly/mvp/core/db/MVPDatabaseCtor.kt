package com.razumly.mvp.core.db

import androidx.room.RoomDatabaseConstructor

@Suppress("KotlinNoActualForExpect")
expect object MVPDatabaseCtor : RoomDatabaseConstructor<MVPDatabaseService> {
    override fun initialize(): MVPDatabaseService
}
