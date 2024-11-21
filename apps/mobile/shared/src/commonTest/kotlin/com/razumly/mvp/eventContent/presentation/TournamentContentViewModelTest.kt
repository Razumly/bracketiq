package com.razumly.mvp.eventContent.presentation

import com.razumly.mvp.core.data.AppwriteRepositoryFake
import com.razumly.mvp.core.data.IAppwriteRepository
import kotlinx.coroutines.test.runTest
import kotlin.test.Test

class TournamentContentViewModelTest {
    private lateinit var viewModel: TournamentContentViewModel
    private lateinit var appwriteRepository: IAppwriteRepository

    @Test
    fun generateRoundsTest() = runTest {
        appwriteRepository = AppwriteRepositoryFake()
        viewModel = TournamentContentViewModel(appwriteRepository)
        viewModel.loadTournament("testTournament")
        viewModel.toggleBracketView()
    }
}