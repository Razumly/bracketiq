package com.razumly.mvp.eventContent.presentation

import com.razumly.mvp.core.data.AppwriteRepositoryFake
import com.razumly.mvp.core.data.IMVPRepository
import kotlinx.coroutines.test.runTest
import kotlin.test.Test

class TournamentContentViewModelTest {
    private lateinit var viewModel: TournamentContentViewModel
    private lateinit var appwriteRepository: IMVPRepository

    @Test
    fun generateRoundsTest() = runTest {
        appwriteRepository = AppwriteRepositoryFake()
        viewModel = TournamentContentViewModel(appwriteRepository)
        viewModel.loadTournament("testTournament")
        viewModel.toggleBracketView()
    }
}