package com.razumly.mvp.core.data


import androidx.room.ConstructedBy
import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.dataTypes.RefundRequest
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.ChatUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.FieldMatchCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.MatchTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentMatchCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentUserCrossRef
import com.razumly.mvp.core.data.dataTypes.daos.ChatGroupDao
import com.razumly.mvp.core.data.dataTypes.daos.EventImpDao
import com.razumly.mvp.core.data.dataTypes.daos.FieldDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchDao
import com.razumly.mvp.core.data.dataTypes.daos.MessageDao
import com.razumly.mvp.core.data.dataTypes.daos.RefundRequestDao
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
        ChatGroup::class,
        MessageMVP::class,
        TeamPlayerCrossRef::class,
        TournamentUserCrossRef::class,
        EventUserCrossRef::class,
        TournamentTeamCrossRef::class,
        EventTeamCrossRef::class,
        TournamentMatchCrossRef::class,
        MatchTeamCrossRef::class,
        FieldMatchCrossRef::class,
        TeamPendingPlayerCrossRef::class,
        ChatUserCrossRef::class,
        RefundRequest::class,
    ], version = 67
)
@TypeConverters(Converters::class)
@ConstructedBy(MVPDatabaseCtor::class)
abstract class MVPDatabaseservice : RoomDatabase(), DatabaseService {
    abstract override val getTournamentDao: TournamentDao
    abstract override val getMatchDao: MatchDao
    abstract override val getTeamDao: TeamDao
    abstract override val getFieldDao: FieldDao
    abstract override val getUserDataDao: UserDataDao
    abstract override val getEventImpDao: EventImpDao
    abstract override val getChatGroupDao: ChatGroupDao
    abstract override val getMessageDao: MessageDao
    abstract override val getRefundRequestDao: RefundRequestDao
}

interface DatabaseService {
    val getTournamentDao: TournamentDao
    val getMatchDao: MatchDao
    val getTeamDao: TeamDao
    val getFieldDao: FieldDao
    val getUserDataDao: UserDataDao
    val getEventImpDao: EventImpDao
    val getChatGroupDao: ChatGroupDao
    val getMessageDao: MessageDao
    val getRefundRequestDao: RefundRequestDao
}