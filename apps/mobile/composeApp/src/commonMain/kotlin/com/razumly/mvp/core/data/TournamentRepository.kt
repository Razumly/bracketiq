package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.TournamentWithRelations
import com.razumly.mvp.core.data.dataTypes.dtos.TournamentDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toTournament
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.eventDetailScreen.data.IMatchRepository
import io.appwrite.services.Account
import io.appwrite.services.Databases
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow

class TournamentRepository(
    private val tournamentDB: MVPDatabase,
    private val account: Account,
    private val database: Databases,
    private val currentUserDataSource: CurrentUserDataSource,
    private val teamRepository: ITeamRepository,
    private val userRepository: IUserRepository,
    private val matchRepository: IMatchRepository,
    private val fieldRepository: IFieldRepository
) : ITournamentRepository {
    @OptIn(ExperimentalCoroutinesApi::class)
    override fun getTournamentWithRelations(tournamentId: String): Flow<Result<TournamentWithRelations>> =
        tournamentDB.getTournamentDao.getTournamentFlowById(tournamentId).flatMapLatest {
            flow {
                emit(IMVPRepository.singleResponse(networkCall = {
                    userRepository.getUsersOfTournament(tournamentId)
                    teamRepository.getTeamsOfTournament(tournamentId)
                    matchRepository.getMatchesOfTournament(tournamentId)
                    database.getDocument(
                        DbConstants.DATABASE_NAME,
                        DbConstants.TOURNAMENT_COLLECTION,
                        tournamentId,
                        nestedType = TournamentDTO::class,
                        queries = null
                    ).data.toTournament(tournamentId)
                }, saveCall = { tournament ->
                    tournamentDB.getTournamentDao.upsertTournament(tournament)
                }, onReturn = {
                    tournamentDB.getTournamentDao.getTournamentWithRelations(tournamentId)
                }))
            }
        }

    override suspend fun createTournament(newTournament: Tournament): Result<Tournament> =
        IMVPRepository.singleResponse(networkCall = {
            database.createDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                newTournament.id,
                newTournament.toTournamentDTO(),
                nestedType = TournamentDTO::class
            ).data.toTournament(newTournament.id)
        }, saveCall = { tournament ->
            tournamentDB.getTournamentDao.upsertTournament(tournament)
        }, onReturn = { tournament ->
            tournament
        })

    override suspend fun updateTournament(newTournament: Tournament): Result<Tournament> =
        IMVPRepository.singleResponse(networkCall = {
            database.updateDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                newTournament.id,
                newTournament.toTournamentDTO(),
                nestedType = TournamentDTO::class
            ).data.toTournament(newTournament.id)
        }, saveCall = { tournament ->
            tournamentDB.getTournamentDao.upsertTournament(tournament)
        }, onReturn = { tournament ->
            tournament
        })

    override suspend fun deleteTournament(tournamentId: String): Result<Unit> =
        kotlin.runCatching {
            database.deleteDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                tournamentId
            )
            tournamentDB.getTournamentDao.deleteTournamentWithCrossRefs(tournamentId)
        }
}