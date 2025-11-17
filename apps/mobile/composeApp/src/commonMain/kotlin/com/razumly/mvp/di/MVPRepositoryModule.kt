package com.razumly.mvp.di

import com.razumly.mvp.chat.data.ChatGroupRepository
import com.razumly.mvp.chat.data.IChatGroupRepository
import com.razumly.mvp.chat.data.IMessageRepository
import com.razumly.mvp.chat.data.MessageRepository
import com.razumly.mvp.core.data.repositories.BillingRepository
import com.razumly.mvp.core.data.repositories.EventRepository
import com.razumly.mvp.core.data.repositories.FieldRepository
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.IImagesRepository
import com.razumly.mvp.core.data.repositories.IPushNotificationsRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.ImagesRepository
import com.razumly.mvp.core.data.repositories.PushNotificationsRepository
import com.razumly.mvp.core.data.repositories.TeamRepository
import com.razumly.mvp.core.data.repositories.UserRepository
import com.razumly.mvp.eventDetail.data.IMatchRepository
import com.razumly.mvp.eventDetail.data.MatchRepository
import org.koin.dsl.bind
import org.koin.dsl.module

val MVPRepositoryModule = module {
    single {
        EventRepository(get(), get(), get(), get(), get(), get())
    } bind IEventRepository::class
    single {
        FieldRepository(get(), get())
    } bind IFieldRepository::class
    single {
        TeamRepository(get(), get(), get(), get())
    } bind ITeamRepository::class
    single {
        UserRepository(get(), get(), get(), get(), get(), get())
    } bind IUserRepository::class
    single {
        MatchRepository(get(), get(), get(), get())
    } bind IMatchRepository::class
    single {
        PushNotificationsRepository(get(), get(), get())
    } bind IPushNotificationsRepository::class
    single {
        MessageRepository(get(), get())
    } bind IMessageRepository::class
    single {
        ChatGroupRepository(get(), get(), get(), get(), get(), get())
    } bind IChatGroupRepository::class
    single {
        BillingRepository(
            get(), get(), get(), get(), get()
        )
    } bind IBillingRepository::class
    single {
        ImagesRepository(
            get(), get()
        )
    } bind IImagesRepository::class
}
