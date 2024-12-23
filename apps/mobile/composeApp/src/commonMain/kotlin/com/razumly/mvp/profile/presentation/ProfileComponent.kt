package com.razumly.mvp.profile.presentation

import com.arkivanov.decompose.ComponentContext

interface ProfileComponent

class DefaultProfileComponent(
    private val componentContext: ComponentContext,
) : ProfileComponent, ComponentContext by componentContext