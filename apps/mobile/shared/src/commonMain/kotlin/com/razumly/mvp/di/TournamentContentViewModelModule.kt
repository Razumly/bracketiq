package com.razumly.mvp.di

import com.razumly.mvp.eventContent.presentation.TournamentContentViewModel
import org.koin.dsl.module

val tournamentContentViewModelModule = module {
    single { (tournamentId: String) ->
        TournamentContentViewModel(
            appwriteRepository = get(),
            tournamentId = tournamentId
        )
    }
}