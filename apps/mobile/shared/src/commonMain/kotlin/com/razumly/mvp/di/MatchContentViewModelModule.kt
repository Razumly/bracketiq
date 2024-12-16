package com.razumly.mvp.di

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.eventContent.presentation.MatchContentViewModel
import org.koin.dsl.module

val matchContentViewModelModule = module {
    single { (selectedMatch: MatchMVP, currentUserId: String) ->
        MatchContentViewModel(
            appwriteRepository = get(),
            selectedMatch = selectedMatch,
            currentUserId = currentUserId
        )
    }
}
