package com.razumly.mvp.profile

import com.arkivanov.decompose.ComponentContext

interface ProfileComponent

class DefaultProfileComponent(
    private val componentContext: ComponentContext,
) : ProfileComponent, ComponentContext by componentContext