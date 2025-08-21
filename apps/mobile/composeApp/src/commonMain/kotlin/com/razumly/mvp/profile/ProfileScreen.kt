package com.razumly.mvp.profile

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import com.arkivanov.decompose.ExperimentalDecomposeApi
import com.arkivanov.decompose.extensions.compose.experimental.stack.ChildStack
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.razumly.mvp.profile.profileDetails.ProfileDetailsScreen

@OptIn(ExperimentalDecomposeApi::class)
@Composable
fun ProfileScreen(component: ProfileComponent) {
    val childStack by component.childStack.subscribeAsState()

    ChildStack(
        stack = childStack,
    ) { child ->
        when (val instance = child.instance) {
            is ProfileComponent.Child.ProfileHome -> {
                ProfileHomeScreen(component = instance.component)
            }

            is ProfileComponent.Child.ProfileDetails -> {
                ProfileDetailsScreen(
                    component = instance.component,
                    onBack = component::onBackClicked
                )
            }
        }
    }
}