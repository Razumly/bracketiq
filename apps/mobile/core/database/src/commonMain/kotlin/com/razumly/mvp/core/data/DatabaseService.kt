package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.daos.ChatGroupDao
import com.razumly.mvp.core.data.dataTypes.daos.DiscountDao
import com.razumly.mvp.core.data.dataTypes.daos.EventComplianceDao
import com.razumly.mvp.core.data.dataTypes.daos.EventDao
import com.razumly.mvp.core.data.dataTypes.daos.EventParticipantManagementDao
import com.razumly.mvp.core.data.dataTypes.daos.EventRegistrationDao
import com.razumly.mvp.core.data.dataTypes.daos.FieldDao
import com.razumly.mvp.core.data.dataTypes.daos.InviteDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchOperationOutboxDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchOperationTransactionDao
import com.razumly.mvp.core.data.dataTypes.daos.MessageDao
import com.razumly.mvp.core.data.dataTypes.daos.PendingRentalOrderDao
import com.razumly.mvp.core.data.dataTypes.daos.RefundRequestDao
import com.razumly.mvp.core.data.dataTypes.daos.TeamDao
import com.razumly.mvp.core.data.dataTypes.daos.UserDataDao
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchOperationOutboxEntry

interface DatabaseService {
    val getMatchDao: MatchDao
    val getMatchOperationOutboxDao: MatchOperationOutboxDao
        get() = error("MatchOperationOutboxDao is not configured.")
    val getMatchOperationTransactionDao: MatchOperationTransactionDao?
        get() = null
    val getTeamDao: TeamDao
    val getFieldDao: FieldDao
    val getUserDataDao: UserDataDao
    val getEventDao: EventDao
    val getEventRegistrationDao: EventRegistrationDao
    val getEventParticipantManagementDao: EventParticipantManagementDao
        get() = error("EventParticipantManagementDao is not configured.")
    val getEventComplianceDao: EventComplianceDao
        get() = error("EventComplianceDao is not configured.")
    val getChatGroupDao: ChatGroupDao
    val getMessageDao: MessageDao
    val getRefundRequestDao: RefundRequestDao
    val getPendingRentalOrderDao: PendingRentalOrderDao
        get() = error("PendingRentalOrderDao is not configured.")
    val getDiscountDao: DiscountDao
        get() = error("DiscountDao is not configured.")
    val getInviteDao: InviteDao
        get() = error("InviteDao is not configured.")

    suspend fun enqueueMatchOperationAndOptimisticMatch(
        operation: MatchOperationOutboxEntry,
        match: MatchMVP,
    ) {
        val transactionDao = getMatchOperationTransactionDao
        if (transactionDao != null) {
            transactionDao.enqueueOperationAndOptimisticMatch(operation, match)
        } else {
            // Test and non-Room implementations retain equivalent ordering; production Room
            // implementations provide the transaction DAO above.
            getMatchOperationOutboxDao.upsertOperation(operation)
            getMatchDao.upsertMatch(match)
        }
    }
}

typealias MVPDatabaseService = com.razumly.mvp.core.db.MVPDatabaseService
