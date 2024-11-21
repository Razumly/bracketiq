package com.razumly.mvp.di

import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.eventContent.presentation.TournamentContentViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

actual val tournamentContentViewModelModule = module {
    viewModel { (tournamentId: String) ->
        TournamentContentViewModel(
            get(),
            tournamentId
        )
    }
}