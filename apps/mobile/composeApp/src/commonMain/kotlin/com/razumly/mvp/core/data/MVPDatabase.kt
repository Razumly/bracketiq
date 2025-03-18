package com.razumly.mvp.core.data


import androidx.room.ConstructedBy
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
import com.razumly.mvp.core.data.dataTypes.UserEventCrossRef
import com.razumly.mvp.core.data.dataTypes.UserTournamentCrossRef
import com.razumly.mvp.core.data.dataTypes.daos.EventImpDao
import com.razumly.mvp.core.data.dataTypes.daos.FieldDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchDao
import com.razumly.mvp.core.data.dataTypes.daos.TeamDao
import com.razumly.mvp.core.data.dataTypes.daos.TournamentDao
import com.razumly.mvp.core.data.dataTypes.daos.UserDataDao
import com.razumly.mvp.core.data.util.Converters

@Database(
    entities = [
        Tournament::class,
        UserData::class,
        MatchMVP::class,
        Field::class,
        EventImp::class,
        Team::class,
        TeamPlayerCrossRef::class,
        UserTournamentCrossRef::class,
        UserEventCrossRef::class,
    ],
    version = 36
)
@TypeConverters(Converters::class)
@ConstructedBy(MVPDatabaseCtor::class)
abstract class MVPDatabase : RoomDatabase() {
    abstract val getTournamentDao: TournamentDao
    abstract val getMatchDao: MatchDao
    abstract val getTeamDao: TeamDao
    abstract val getFieldDao: FieldDao
    abstract val getUserDataDao: UserDataDao
    abstract val getEventImpDao: EventImpDao
}