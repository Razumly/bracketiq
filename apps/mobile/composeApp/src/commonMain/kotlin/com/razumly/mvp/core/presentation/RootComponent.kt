package com.razumly.mvp.core.presentation

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.stack.pop
import com.arkivanov.decompose.router.stack.replaceCurrent
import com.arkivanov.essenty.backhandler.BackHandler
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.home.DefaultHomeComponent
import com.razumly.mvp.home.HomeComponent
import com.razumly.mvp.userAuth.DefaultAuthComponent
import dev.icerock.moko.geo.LocationTracker
import dev.icerock.moko.permissions.DeniedAlwaysException
import dev.icerock.moko.permissions.DeniedException
import dev.icerock.moko.permissions.Permission
import dev.icerock.moko.permissions.PermissionsController
import io.github.aakira.napier.Napier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

class RootComponent(
    componentContext: ComponentContext,
    val permissionsController: PermissionsController,
    val locationTracker: LocationTracker,
    private var deepLinkNav: DeepLinkNav?
) : ComponentContext by componentContext {

    private val navigation = StackNavigation<Config>()
    private val _koin = getKoin()
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())

    override val backHandler: BackHandler = componentContext.backHandler

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
        handleBackButton = true,
        childFactory = ::createChild
    )

    fun handleDeepLink(deepLinkNav: DeepLinkNav?) {
        this.deepLinkNav = deepLinkNav
        val currentChild = childStack.value.active.instance
        if (currentChild is Child.Home && deepLinkNav != null) {
            Napier.d(
                tag = "RootComponent",
                message = "Updating existing HomeComponent with deep link: $deepLinkNav"
            )
            currentChild.component.handleDeepLink(deepLinkNav)
        } else {
            Napier.d(
                tag = "RootComponent", message = "Navigating to Home with deep link: $deepLinkNav"
            )
            navigation.replaceCurrent(Config.Home)
        }
    }

    fun requestInitialPermissions() {
        scope.launch {
            try {
                permissionsController.providePermission(Permission.LOCATION)
            } catch (deniedAlwaysException: DeniedAlwaysException) {
                // Permission is always denied
            } catch (denied: DeniedException) {
                // Permission was denied
            }
            try {
                permissionsController.providePermission(Permission.REMOTE_NOTIFICATION)
            } catch (deniedAlwaysException: DeniedAlwaysException) {
                // Permission is always denied
            } catch (denied: DeniedException) {
                // Permission was denied
            }
            if (permissionsController.isPermissionGranted(Permission.LOCATION)) {
                Napier.d(tag = "Permissions") { "Location permission granted" }
            } else {
                Napier.d(tag = "Permissions") { "Location permission not granted" }
            }
        }
    }

    @Throws(Throwable::class)
    private fun createChild(
        config: Config, componentContext: ComponentContext
    ): Child = when (config) {
        is Config.Login -> Child.Login(
            _koin.inject<DefaultAuthComponent> {
                parametersOf(componentContext, {
                    navigation.replaceCurrent(Config.Home)
                })
            }.value
        )

        is Config.Home -> Child.Home(
            _koin.inject<DefaultHomeComponent> {
                parametersOf(
                    componentContext,
                    deepLinkNav,
                    { navigation.replaceCurrent(Config.Login) })
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

    sealed class DeepLinkNav {
        data class Event(val eventId: String) : DeepLinkNav()
        data class Tournament(val tournamentId: String) : DeepLinkNav()
        data object Refresh : DeepLinkNav()
        data object Return : DeepLinkNav()
    }
}
