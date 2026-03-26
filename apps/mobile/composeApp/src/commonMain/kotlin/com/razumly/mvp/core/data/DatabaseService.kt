package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.daos.ChatGroupDao
import com.razumly.mvp.core.data.dataTypes.daos.EventDao
import com.razumly.mvp.core.data.dataTypes.daos.FieldDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchDao
import com.razumly.mvp.core.data.dataTypes.daos.MessageDao
import com.razumly.mvp.core.data.dataTypes.daos.RefundRequestDao
import com.razumly.mvp.core.data.dataTypes.daos.TeamDao
import com.razumly.mvp.core.data.dataTypes.daos.UserDataDao

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

typealias MVPDatabaseService = com.razumly.mvp.core.db.MVPDatabaseService
