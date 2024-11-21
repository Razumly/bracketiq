package com.razumly.mvp.di

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.eventContent.presentation.MatchContentViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

actual val matchContentViewModelModule = module {
    viewModel { (selectedMatch: MatchMVP, currentUserId: String) ->
        MatchContentViewModel(
            get(),
            selectedMatch,
            currentUserId
        )
    }
}