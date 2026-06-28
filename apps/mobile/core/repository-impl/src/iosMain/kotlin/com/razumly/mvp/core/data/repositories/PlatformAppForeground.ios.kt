package com.razumly.mvp.core.data.repositories

import platform.Foundation.NSUserDefaults

internal actual fun isApplicationInForeground(): Boolean {
    return NSUserDefaults.standardUserDefaults.boolForKey("mvp_app_is_foreground")
}
