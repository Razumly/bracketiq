package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.MVPDatabase
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.TournamentWithRelations
import com.razumly.mvp.core.data.dataTypes.dtos.TournamentDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toTournament
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.convert
import com.razumly.mvp.eventDetailScreen.data.IMatchRepository
import io.appwrite.services.Databases
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

class TournamentRepository(
    private val mvpDatabase: MVPDatabase,
    private val database: Databases,
    private val teamRepository: ITeamRepository,
    private val userRepository: IUserRepository,
    private val matchRepository: IMatchRepository,
    private val fieldRepository: IFieldRepository
) : ITournamentRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun getTournamentWithRelationsFlow(tournamentId: String): Flow<Result<TournamentWithRelations?>> {
        val localFlow = mvpDatabase.getTournamentDao.getTournamentWithRelationsFlow(tournamentId)
            .map { Result.success(it) }
        scope.launch {
            getTournament(tournamentId)
            fieldRepository.getFieldsInTournament(tournamentId)
            userRepository.getUsersOfTournament(tournamentId)
            teamRepository.getTeamsOfTournament(tournamentId)
            matchRepository.getMatchesOfTournament(tournamentId)
        }
        return localFlow
    }

    override suspend fun getTournaments(query: String): Result<List<Tournament>> =
        multiResponse(getRemoteData = {
            database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                queries = listOf(query),
                TournamentDTO::class
            ).documents.map { dtoDoc -> dtoDoc.convert { it.toTournament(dtoDoc.id) }.data }
        }, getLocalData = {
            listOf()
        }, saveData = { mvpDatabase.getTournamentDao.upsertTournaments(it) })

    override fun getTournamentsFlow(query: String): Flow<Result<List<TournamentWithRelations>>> {
        val localFlow =
            mvpDatabase.getTournamentDao.getAllCachedTournamentsFlow().map { Result.success(it) }
        scope.launch {
            getTournaments(query)
        }
        return localFlow
    }

    override suspend fun getTournament(tournamentId: String): Result<TournamentWithRelations> =
        singleResponse(networkCall = {
            database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                tournamentId,
                nestedType = TournamentDTO::class,
                queries = null
            ).data.toTournament(tournamentId)
        }, saveCall = { tournament ->
            mvpDatabase.getTournamentDao.upsertTournamentWithRelations(tournament)
        }, onReturn = {
            mvpDatabase.getTournamentDao.getTournamentWithRelations(tournamentId)
        })

    override suspend fun createTournament(newTournament: Tournament): Result<Tournament> =
        singleResponse(networkCall = {
            database.createDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                newTournament.id,
                newTournament.toTournamentDTO(),
                nestedType = TournamentDTO::class
            ).data.toTournament(newTournament.id)
        }, saveCall = { tournament ->
            mvpDatabase.getTournamentDao.upsertTournament(tournament)
        }, onReturn = { tournament ->
            tournament
        })

    override suspend fun updateTournament(newTournament: Tournament): Result<Tournament> =
        singleResponse(networkCall = {
            database.updateDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                newTournament.id,
                newTournament.toTournamentDTO(),
                nestedType = TournamentDTO::class
            ).data.toTournament(newTournament.id)
        }, saveCall = { tournament ->
            mvpDatabase.getTournamentDao.upsertTournament(tournament)
        }, onReturn = { tournament ->
            tournament
        })

    override suspend fun deleteTournament(tournamentId: String): Result<Unit> = kotlin.runCatching {
        database.deleteDocument(
            DbConstants.DATABASE_NAME, DbConstants.TOURNAMENT_COLLECTION, tournamentId
        )
        mvpDatabase.getTournamentDao.deleteTournamentWithCrossRefs(tournamentId)
    }
}