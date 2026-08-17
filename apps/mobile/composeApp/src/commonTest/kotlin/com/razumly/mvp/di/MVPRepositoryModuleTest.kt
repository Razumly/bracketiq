package com.razumly.mvp.di

import kotlin.test.Test
import kotlin.test.assertTrue

class MVPRepositoryModuleTest {
    @Test
    fun repositories_are_not_eagerly_constructed_during_app_startup() {
        assertTrue(MVPRepositoryModule.eagerInstances.isEmpty())
    }
}
