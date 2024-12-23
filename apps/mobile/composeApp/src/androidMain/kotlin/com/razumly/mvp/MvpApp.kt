package com.razumly.mvp

import android.app.Application
import com.razumly.mvp.di.KoinInitializer

class MvpApp : Application() {
    override fun onCreate() {
        super.onCreate()

        KoinInitializer(applicationContext).init()
    }
}