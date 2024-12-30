package com.razumly.mvp.core.presentation

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.stack.replaceCurrent
import com.razumly.mvp.userAuth.presentation.loginScreen.DefaultLoginComponent
import com.razumly.mvp.userAuth.presentation.loginScreen.LoginComponent
import dev.icerock.moko.geo.LocationTracker
import dev.icerock.moko.permissions.DeniedAlwaysException
import dev.icerock.moko.permissions.DeniedException
import dev.icerock.moko.permissions.Permission
import dev.icerock.moko.permissions.PermissionsController
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin
import com.razumly.mvp.core.presentation.HomeComponent.*

class RootComponent(
    componentContext: ComponentContext,
    val permissionsController: PermissionsController,
    val locationTracker: LocationTracker
) : ComponentContext by componentContext {
    private val navigation = StackNavigation<Config>()
    private val _koin = getKoin()
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    // Create onLogin reference before childStack
    private val onLoginCallback = {
        navigation.replaceCurrent(Config.Home())
    }

    init {
        scope.launch {
            try {
                permissionsController.providePermission(Permission.LOCATION)
                locationTracker.startTracking()
            } catch (deniedAlways: DeniedAlwaysException) {
                // Permission is always denied.
            } catch (denied: DeniedException) {
                // Permission was denied.
            }
        }
    }

    val childStack = childStack(
        source = navigation,
        initialConfiguration = Config.Login,
        serializer = Config.serializer(),
        handleBackButton = true,
        childFactory = ::createChild
    )

    private fun createChild(
        config: Config,
        componentContext: ComponentContext
    ): Child = when (config) {
        is Config.Login -> Child.Login(
            _koin.inject<DefaultLoginComponent> {
                parametersOf(componentContext, onLoginCallback)
            }.value
        )

        is Config.Home -> Child.Home(
            _koin.inject<DefaultHomeComponent> {
                parametersOf(componentContext)
            }.value
        )
    }

    sealed class Child {
        data class Login(val component: LoginComponent) : Child()
        data class Home(val component: HomeComponent) : Child()
    }

    @Serializable
    sealed class Config{
        @Serializable
        data object Login : Config()

        @Serializable
        data class Home(val selectedPage: Page = Page.EventList) : Config()
    }

}
