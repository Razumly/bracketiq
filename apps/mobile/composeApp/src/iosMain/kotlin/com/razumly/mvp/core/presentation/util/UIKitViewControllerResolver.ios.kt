package com.razumly.mvp.core.presentation.util

import platform.UIKit.UIApplication
import platform.UIKit.UISceneActivationStateForegroundActive
import platform.UIKit.UIViewController
import platform.UIKit.UIWindowScene

internal fun topViewController(): UIViewController? {
    val application = UIApplication.sharedApplication
    val activeWindowScene = application.connectedScenes.firstOrNull { scene ->
        scene is UIWindowScene && scene.activationState == UISceneActivationStateForegroundActive
    } as? UIWindowScene

    @Suppress("DEPRECATION")
    val rootViewController = activeWindowScene?.keyWindow?.rootViewController
        ?: application.keyWindow?.rootViewController
        ?: return null

    var top = rootViewController
    while (true) {
        val presented = top.presentedViewController ?: break
        top = presented
    }
    return top
}
