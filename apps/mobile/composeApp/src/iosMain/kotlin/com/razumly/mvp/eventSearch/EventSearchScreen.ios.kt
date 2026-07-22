package com.razumly.mvp.eventSearch

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.viewinterop.UIKitViewController
import com.razumly.mvp.LocalNativeViewFactory
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.guides.LocalGuideController
import com.razumly.mvp.eventMap.MapComponent

@Composable
actual fun EventSearchScreen(
    component: EventSearchComponent,
    mapComponent: MapComponent,
) {
    val factory = LocalNativeViewFactory.current
    val bottomPadding = LocalNavBarPadding.current.calculateBottomPadding().value
    val guideController = LocalGuideController.current
    val shouldShowOnboarding = guideController?.let { controller ->
        controller.completedGuideIdsLoaded && DISCOVER_GUIDE_ID !in controller.completedGuideIds
    } == true

    UIKitViewController(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Transparent),
        factory = {
            factory.createNativeDiscoverViewController(
                component = component,
                mapComponent = mapComponent,
                bottomPadding = bottomPadding,
                shouldShowOnboarding = shouldShowOnboarding,
                onOnboardingCompleted = {
                    guideController?.completeGuide(DISCOVER_GUIDE_ID)
                },
            )
        },
        update = { viewController ->
            factory.updateNativeDiscoverViewController(
                viewController = viewController,
                bottomPadding = bottomPadding,
                shouldShowOnboarding = shouldShowOnboarding,
            )
        },
    )
}
