package com.razumly.mvp.core.data

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.UserTournamentCrossRef
import com.razumly.mvp.core.data.dataTypes.daos.EventImpDao
import com.razumly.mvp.core.data.dataTypes.daos.FieldDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchDao
import com.razumly.mvp.core.data.dataTypes.daos.TeamDao
import com.razumly.mvp.core.data.dataTypes.daos.TournamentDao
import com.razumly.mvp.core.data.dataTypes.daos.UserDataDao
import com.razumly.mvp.core.util.Converters
import io.ktor.utils.io.locks.synchronized
import kotlinx.coroutines.InternalCoroutinesApi
import kotlinx.coroutines.internal.synchronized
import kotlin.concurrent.Volatile

@Database(
    entities = [
        Tournament::class,
        UserData::class,
        MatchMVP::class,
        Field::class,
        Team::class,
        EventImp::class,
        TeamPlayerCrossRef::class,
        UserTournamentCrossRef::class,
    ],
    version = 11
)
@TypeConverters(Converters::class)
abstract class MVPDatabase : RoomDatabase() {
    abstract fun getTournamentDao(): TournamentDao
    abstract fun getMatchDao(): MatchDao
    abstract fun getTeamDao(): TeamDao
    abstract fun getFieldDao(): FieldDao
    abstract fun getUserDataDao(): UserDataDao
    abstract fun getEventImpDao(): EventImpDao
}