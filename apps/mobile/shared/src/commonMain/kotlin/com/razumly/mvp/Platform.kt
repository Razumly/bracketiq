package com.razumly.mvp

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform