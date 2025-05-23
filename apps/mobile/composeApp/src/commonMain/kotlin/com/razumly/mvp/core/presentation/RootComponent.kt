package com.razumly.mvp.core.presentation

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.stack.pop
import com.arkivanov.decompose.router.stack.replaceCurrent
import com.arkivanov.essenty.backhandler.BackHandler
import com.razumly.mvp.home.DefaultHomeComponent
import com.razumly.mvp.home.HomeComponent
import com.razumly.mvp.userAuth.DefaultAuthComponent
import dev.icerock.moko.geo.LocationTracker
import dev.icerock.moko.permissions.DeniedAlwaysException
import dev.icerock.moko.permissions.DeniedException
import dev.icerock.moko.permissions.Permission
import dev.icerock.moko.permissions.PermissionsController
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

class RootComponent(
    componentContext: ComponentContext,
    val permissionsController: PermissionsController,
) : ComponentContext by componentContext {

    private val navigation = StackNavigation<Config>()
    private val _koin = getKoin()
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override val backHandler: BackHandler = componentContext.backHandler

    /** Called by your UI when user swipes back or taps the back button. */
    fun onBackClicked() {
        val stack = childStack.value
        if (stack.backStack.isNotEmpty()) {
            navigation.pop()
        }
    }

    val childStack = childStack(
        source = navigation,
        initialConfiguration = Config.Login,
        serializer = Config.serializer(),
        handleBackButton = true, // Enable built-in back handling logic
        childFactory = ::createChild
    )

    init {
        scope.launch {
            try {
                permissionsController.providePermission(Permission.LOCATION)
            } catch (deniedAlways: DeniedAlwaysException) {
                // Permission is always denied
            } catch (denied: DeniedException) {
                // Permission was denied
            }
            if (permissionsController.isPermissionGranted(Permission.LOCATION)) {
                Napier.d(tag = "Permissions") { "Location permission granted" }
            } else {
                Napier.d(tag = "Permissions") { "Location permission not granted" }
            }
            childStack.subscribe{}
        }
    }

    @Throws(Throwable::class)
    private fun createChild(
        config: Config,
        componentContext: ComponentContext
    ): Child = when (config) {
        is Config.Login -> Child.Login(
            _koin.inject<DefaultAuthComponent> {
                parametersOf(
                    componentContext,
                    { navigation.replaceCurrent(Config.Home) }
                )
            }.value
        )
        is Config.Home -> Child.Home(
            _koin.inject<DefaultHomeComponent> {
                parametersOf(
                    componentContext,
                    { navigation.replaceCurrent(Config.Login)}
                )
            }.value
        )
    }

    sealed class Child {
        data class Login(val component: DefaultAuthComponent) : Child()
        data class Home(val component: HomeComponent) : Child()
    }

    @Serializable
    sealed class Config {
        @Serializable
        data object Login : Config()

        @Serializable
        data object Home : Config()
    }
}
