package com.razumly.mvp.core.db

import androidx.room.RoomDatabaseConstructor
import com.razumly.mvp.core.data.MVPDatabaseService

@Suppress("NO_ACTUAL_FOR_EXPECT")
expect object MVPDatabaseCtor : RoomDatabaseConstructor<MVPDatabaseService> {
    override fun initialize(): MVPDatabaseService
}
