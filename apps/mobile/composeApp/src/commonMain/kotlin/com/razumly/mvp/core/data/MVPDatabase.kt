package com.razumly.mvp.core.data


import androidx.room.ConstructedBy
import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.PickupGame
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.UserPickupGameCrossRef
import com.razumly.mvp.core.data.dataTypes.UserTournamentCrossRef
import com.razumly.mvp.core.data.dataTypes.daos.EventImpDao
import com.razumly.mvp.core.data.dataTypes.daos.FieldDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchDao
import com.razumly.mvp.core.data.dataTypes.daos.PickupGameDao
import com.razumly.mvp.core.data.dataTypes.daos.TeamDao
import com.razumly.mvp.core.data.dataTypes.daos.TournamentDao
import com.razumly.mvp.core.data.dataTypes.daos.UserDataDao
import com.razumly.mvp.core.util.Converters

@Database(
    entities = [
        Tournament::class,
        UserData::class,
        MatchMVP::class,
        Field::class,
        PickupGame::class,
        Team::class,
        EventImp::class,
        TeamPlayerCrossRef::class,
        UserTournamentCrossRef::class,
        UserPickupGameCrossRef::class,
    ],
    version = 27
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
    abstract val getPickupGameDao: PickupGameDao
}