package com.razumly.mvp.eventMap

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.ComponentContextFactory
import com.arkivanov.essenty.backhandler.BackHandler
import com.arkivanov.essenty.instancekeeper.InstanceKeeper
import com.arkivanov.essenty.lifecycle.Lifecycle
import com.arkivanov.essenty.statekeeper.StateKeeper
import com.razumly.mvp.core.data.repositories.IEventAbsRepository
import dev.icerock.moko.geo.LatLng
import dev.icerock.moko.geo.LocationTracker
import kotlinx.coroutines.flow.StateFlow

actual class MapComponent(
    componentContext: ComponentContext,
    private val eventAbsRepository: IEventAbsRepository,
    val locationTracker: LocationTracker
)  :
    ComponentContext {
    override val backHandler: BackHandler
        get() = TODO("Not yet implemented")
    override val componentContextFactory: ComponentContextFactory<ComponentContext>
        get() = TODO("Not yet implemented")
    override val instanceKeeper: InstanceKeeper
        get() = TODO("Not yet implemented")
    override val lifecycle: Lifecycle
        get() = TODO("Not yet implemented")
    override val stateKeeper: StateKeeper
        get() = TODO("Not yet implemented")
    actual val currentLocation: StateFlow<LatLng?>
        get() = TODO("Not yet implemented")
}