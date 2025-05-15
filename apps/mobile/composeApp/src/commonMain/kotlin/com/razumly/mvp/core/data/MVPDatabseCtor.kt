package com.razumly.mvp.core.data
import androidx.room.RoomDatabaseConstructor

@Suppress("NO_ACTUAL_FOR_EXPECT")
expect object MVPDatabaseCtor : RoomDatabaseConstructor<MVPDatabase>{
    override fun initialize(): MVPDatabase
}
