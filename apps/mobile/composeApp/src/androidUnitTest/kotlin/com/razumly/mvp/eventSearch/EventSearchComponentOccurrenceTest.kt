@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventSearch

import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.backhandler.BackDispatcher
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventSearchOccurrence
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.ISportsRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.eventDetail.data.IMatchRepository
import dev.icerock.moko.geo.LocationTracker
import dev.icerock.moko.permissions.PermissionsController
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import kotlin.time.Instant

class EventSearchComponentOccurrenceTest {
    @Test
    fun givenSameCanonicalEventOnTwoPages_whenLoaded_thenEventCardsExposeLatestOccurrence() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val canonicalEvent = Event(
                id = "weekly-event",
                name = "Weekly event",
                start = Instant.parse("2030-01-01T00:00:00Z"),
                end = Instant.parse("2035-01-01T00:00:00Z"),
            )
            val firstPage = canonicalEvent.copy().also { event ->
                event.nextOccurrence = occurrence("2030-07-01")
            }
            val secondPage = canonicalEvent.copy().also { event ->
                event.nextOccurrence = occurrence("2030-07-08")
            }
            val eventRepository = mockk<IEventRepository>(relaxed = true)
            every { eventRepository.getCachedEventsFlow() } returns flowOf(Result.success(emptyList()))
            coEvery {
                eventRepository.getEventsInBounds(
                    bounds = any(),
                    dateFrom = any(),
                    dateTo = any(),
                    sports = any(),
                    tags = any(),
                    price = any(),
                    divisionGenders = any(),
                    skillDivisionTypeIds = any(),
                    ageDivisionTypeIds = any(),
                    limit = any(),
                    offset = any(),
                    includeDistanceFilter = any(),
                    sort = any(),
                )
            } returnsMany listOf(
                Result.success(listOf(firstPage) to true),
                Result.success(listOf(secondPage) to false),
            )

            val userRepository = mockk<IUserRepository>(relaxed = true)
            every { userRepository.currentUser } returns MutableStateFlow(
                Result.failure(IllegalStateException("not signed in")),
            )
            val locationTracker = mockk<LocationTracker>(relaxed = true)
            every { locationTracker.getLocationsFlow() } returns emptyFlow()
            val component = DefaultEventSearchComponent(
                componentContext = activeComponentContext(),
                eventRepository = eventRepository,
                matchRepository = mockk<IMatchRepository>(relaxed = true),
                billingRepository = mockk<IBillingRepository>(relaxed = true),
                fieldRepository = mockk<IFieldRepository>(relaxed = true),
                teamRepository = mockk<ITeamRepository>(relaxed = true),
                sportsRepository = mockk<ISportsRepository>(relaxed = true),
                userRepository = userRepository,
                eventId = null,
                locationTracker = locationTracker,
                navigationHandler = mockk<INavigationHandler>(relaxed = true),
                permissionsController = mockk<PermissionsController>(relaxed = true),
                currentUserDataSource = mockk<CurrentUserDataSource>(relaxed = true),
            )

            component.loadMoreEvents()
            advanceUntilIdle()
            component.loadMoreEvents()
            advanceUntilIdle()

            assertEquals("2030-07-08", component.eventCards.value.single().nextOccurrence?.occurrenceDate)
            assertEquals(canonicalEvent.start, component.eventCards.value.single().event.start)
            assertEquals(canonicalEvent.end, component.eventCards.value.single().event.end)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun givenChangedRoomScheduleWithoutOccurrence_whenCacheRefreshes_thenStaleOccurrenceIsReplaced() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            try {
                val canonicalEvent = Event(
                    id = "weekly-event",
                    name = "Weekly event",
                    start = Instant.parse("2030-01-01T00:00:00Z"),
                    end = Instant.parse("2035-01-01T00:00:00Z"),
                    eventType = EventType.WEEKLY_EVENT,
                    timeSlotIds = listOf("slot"),
                )
                val remoteEvent = canonicalEvent.copy().also { event ->
                    event.nextOccurrence = occurrence("2030-07-01")
                }
                val roomEvent = canonicalEvent.copy(
                    start = Instant.parse("2031-01-01T00:00:00Z"),
                )
                val cachedEvents = MutableStateFlow<Result<List<Event>>>(
                    Result.success(emptyList()),
                )
                val eventRepository = mockk<IEventRepository>(relaxed = true)
                every { eventRepository.getCachedEventsFlow() } returns cachedEvents
                coEvery {
                    eventRepository.getEventsInBounds(
                        bounds = any(),
                        dateFrom = any(),
                        dateTo = any(),
                        sports = any(),
                        tags = any(),
                        price = any(),
                        divisionGenders = any(),
                        skillDivisionTypeIds = any(),
                        ageDivisionTypeIds = any(),
                        limit = any(),
                        offset = any(),
                        includeDistanceFilter = any(),
                        sort = any(),
                    )
                } returns Result.success(listOf(remoteEvent) to false)

                val userRepository = mockk<IUserRepository>(relaxed = true)
                every { userRepository.currentUser } returns MutableStateFlow(
                    Result.failure(IllegalStateException("not signed in")),
                )
                val locationTracker = mockk<LocationTracker>(relaxed = true)
                every { locationTracker.getLocationsFlow() } returns emptyFlow()
                val fieldRepository = mockk<IFieldRepository>(relaxed = true)
                coEvery { fieldRepository.getTimeSlots(any()) } returns Result.success(
                    listOf(
                        TimeSlot(
                            id = "slot",
                            dayOfWeek = 0,
                            startTimeMinutes = 9 * 60,
                            endTimeMinutes = 10 * 60,
                            startDate = Instant.parse("2030-01-01T00:00:00Z"),
                            repeating = true,
                            endDate = Instant.parse("2035-01-01T00:00:00Z"),
                            price = null,
                        ),
                    ),
                )
                val component = DefaultEventSearchComponent(
                    componentContext = activeComponentContext(),
                    eventRepository = eventRepository,
                    matchRepository = mockk<IMatchRepository>(relaxed = true),
                    billingRepository = mockk<IBillingRepository>(relaxed = true),
                    fieldRepository = fieldRepository,
                    teamRepository = mockk<ITeamRepository>(relaxed = true),
                    sportsRepository = mockk<ISportsRepository>(relaxed = true),
                    userRepository = userRepository,
                    eventId = null,
                    locationTracker = locationTracker,
                    navigationHandler = mockk<INavigationHandler>(relaxed = true),
                    permissionsController = mockk<PermissionsController>(relaxed = true),
                    currentUserDataSource = mockk<CurrentUserDataSource>(relaxed = true),
                )

                component.loadMoreEvents()
                advanceUntilIdle()
                assertEquals(
                    "2030-07-01",
                    component.eventCards.value.single().nextOccurrence?.occurrenceDate,
                )

                cachedEvents.value = Result.success(listOf(roomEvent))
                advanceUntilIdle()

                val refreshedCard = component.eventCards.value.single()
                assertEquals(roomEvent.start, refreshedCard.event.start)
                assertTrue(refreshedCard.nextOccurrence != null)
                assertNotEquals("2030-07-01", refreshedCard.nextOccurrence?.occurrenceDate)
                cachedEvents.value = Result.success(emptyList())
                advanceUntilIdle()
                assertTrue(component.eventCards.value.isEmpty())

                cachedEvents.value = Result.success(
                    listOf(roomEvent.copy(archivedAt = "2031-02-01T00:00:00Z")),
                )
                advanceUntilIdle()

                assertTrue(component.eventCards.value.isEmpty())
            } finally {
                Dispatchers.resetMain()
            }
        }

    private fun occurrence(date: String): EventSearchOccurrence = EventSearchOccurrence(
        slotId = "slot",
        occurrenceDate = date,
        start = Instant.parse("${date}T09:00:00Z"),
        end = Instant.parse("${date}T10:00:00Z"),
    )

    private fun activeComponentContext(): DefaultComponentContext {
        val lifecycle = LifecycleRegistry().apply {
            onCreate()
            onStart()
            onResume()
        }
        return DefaultComponentContext(
            lifecycle = lifecycle,
            backHandler = BackDispatcher(),
        )
    }
}
