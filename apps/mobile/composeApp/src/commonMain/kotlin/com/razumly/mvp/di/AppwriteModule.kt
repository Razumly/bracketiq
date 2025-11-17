package com.razumly.mvp.di

import io.appwrite.services.Account
import io.appwrite.services.Avatars
import io.appwrite.services.TablesDB
import io.appwrite.services.Functions
import io.appwrite.services.Messaging
import io.appwrite.services.Realtime
import io.appwrite.services.Storage
import org.koin.core.module.Module
import org.koin.dsl.module

expect val clientModule: Module

val appwriteModule = module {
    single {
        Account(get())
    }
    single {
        TablesDB(get())
    }
    single {
        Realtime(get())
    }
    single {
        Functions(get())
    }
    single {
        Messaging(get())
    }
    single {
        Storage(get())
    }

    single {
        Avatars(get())
    }
}
