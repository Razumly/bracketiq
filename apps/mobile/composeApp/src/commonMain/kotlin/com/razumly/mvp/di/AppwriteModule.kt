package com.razumly.mvp.di

import io.appwrite.services.Account
import io.appwrite.services.Databases
import io.appwrite.services.Functions
import io.appwrite.services.Realtime
import org.koin.core.module.Module
import org.koin.dsl.module

expect val clientModule: Module

val appwriteModule = module {
    single {
        Account(get())
    }
    single {
        Databases(get())
    }
    single {
        Realtime(get())
    }
    single {
        Functions(get())
    }
}