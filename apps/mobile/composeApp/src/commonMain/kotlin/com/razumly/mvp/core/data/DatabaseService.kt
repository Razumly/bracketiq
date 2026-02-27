package com.razumly.mvp.core.data


import androidx.room.ConstructedBy
import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.dataTypes.RefundRequest
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.ChatUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.daos.ChatGroupDao
import com.razumly.mvp.core.data.dataTypes.daos.EventDao
import com.razumly.mvp.core.data.dataTypes.daos.FieldDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchDao
import com.razumly.mvp.core.data.dataTypes.daos.MessageDao
import com.razumly.mvp.core.data.dataTypes.daos.RefundRequestDao
import com.razumly.mvp.core.data.dataTypes.daos.TeamDao
import com.razumly.mvp.core.data.dataTypes.daos.UserDataDao
import com.razumly.mvp.core.data.util.Converters

@Database(
    entities = [
        Event::class,
        UserData::class,
        MatchMVP::class,
        Field::class,
        Team::class,
        ChatGroup::class,
        MessageMVP::class,
        TeamPlayerCrossRef::class,
        EventUserCrossRef::class,
        EventTeamCrossRef::class,
        TeamPendingPlayerCrossRef::class,
        ChatUserCrossRef::class,
        RefundRequest::class,
    ], version = 3
)
@TypeConverters(Converters::class)
@ConstructedBy(MVPDatabaseCtor::class)
abstract class MVPDatabaseservice : RoomDatabase(), DatabaseService {
    abstract override val getMatchDao: MatchDao
    abstract override val getTeamDao: TeamDao
    abstract override val getFieldDao: FieldDao
    abstract override val getUserDataDao: UserDataDao
    abstract override val getEventDao: EventDao
    abstract override val getChatGroupDao: ChatGroupDao
    abstract override val getMessageDao: MessageDao
    abstract override val getRefundRequestDao: RefundRequestDao
}

interface DatabaseService {
    val getMatchDao: MatchDao
    val getTeamDao: TeamDao
    val getFieldDao: FieldDao
    val getUserDataDao: UserDataDao
    val getEventDao: EventDao
    val getChatGroupDao: ChatGroupDao
    val getMessageDao: MessageDao
    val getRefundRequestDao: RefundRequestDao
}
