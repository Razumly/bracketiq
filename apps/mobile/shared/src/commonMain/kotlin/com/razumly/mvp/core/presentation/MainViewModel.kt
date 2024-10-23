package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.Database
import com.rickclephas.kmp.observableviewmodel.ViewModel
import kotlinx.coroutines.flow.flow

class MainViewModel(private val database: Database): ViewModel() {

    val currentTournament = flow { database.getTournament("665fd4b40001fe3199da")
        ?.let { emit(it) } }
}