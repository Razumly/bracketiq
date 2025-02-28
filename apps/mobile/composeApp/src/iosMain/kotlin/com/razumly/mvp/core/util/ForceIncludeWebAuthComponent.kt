package com.razumly.mvp.core.util

import io.appwrite.WebAuthComponent

fun forceIncludeWebAuthComponent(): WebAuthComponent {
    // Returning a new instance is enough to have WebAuthComponent in the public API.
    return WebAuthComponent()
}