package com.razumly.mvp.di

import com.razumly.mvp.chat.data.ChatGroupRepository
import com.razumly.mvp.chat.data.IChatGroupRepository
import com.razumly.mvp.chat.data.IMessagesRepository
import com.razumly.mvp.chat.data.MessagesRepository
import com.razumly.mvp.core.data.repositories.EventAbsRepository
import com.razumly.mvp.core.data.repositories.EventRepository
import com.razumly.mvp.core.data.repositories.FieldRepository
import com.razumly.mvp.core.data.repositories.IEventAbsRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.ITournamentRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.PushNotificationsRepository
import com.razumly.mvp.core.data.repositories.TeamRepository
import com.razumly.mvp.core.data.repositories.TournamentRepository
import com.razumly.mvp.core.data.repositories.UserRepository
import com.razumly.mvp.eventDetail.data.IMatchRepository
import com.razumly.mvp.eventDetail.data.MatchRepository
import org.koin.dsl.bind
import org.koin.dsl.module

val MVPRepositoryModule = module {
    single {
        EventAbsRepository(get(), get(), get(), get())
    } bind IEventAbsRepository::class
    single {
        EventRepository(get(), get(), get(), get())
    } bind IEventRepository::class
    single {
        FieldRepository(get(), get())
    } bind IFieldRepository::class
    single {
        TeamRepository(get(), get(), get(), get())
    } bind ITeamRepository::class
    single {
        TournamentRepository(get(), get(), get(), get(), get(), get())
    } bind ITournamentRepository::class
    single {
        UserRepository(get(), get(), get(), get(), get())
    } bind IUserRepository::class
    single {
        MatchRepository(get(), get(), get())
    } bind IMatchRepository::class
    single {
        PushNotificationsRepository(get(), get(), get())
    }
    single {
        MessagesRepository(get(), get(), get())
    } bind IMessagesRepository::class
    single {
        ChatGroupRepository(get(), get(), get(), get())
    } bind IChatGroupRepository::class
}