package com.razumly.mvp.profile

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import com.arkivanov.decompose.ExperimentalDecomposeApi
import com.arkivanov.decompose.extensions.compose.experimental.stack.ChildStack
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.profile.profileDetails.ProfileDetailsScreen

@OptIn(ExperimentalDecomposeApi::class)
@Composable
fun ProfileScreen(component: ProfileComponent) {
    val childStack by component.childStack.subscribeAsState()
    val popupHandler = LocalPopupHandler.current
    val loadingHandler = LocalLoadingHandler.current

    LaunchedEffect(component, loadingHandler) {
        component.setLoadingHandler(loadingHandler)
    }

    LaunchedEffect(component, popupHandler) {
        component.errorState.collect { error ->
            if (error != null) {
                popupHandler.showPopup(error)
            }
        }
    }

    ChildStack(
        stack = childStack,
    ) { child ->
        when (val instance = child.instance) {
            is ProfileComponent.Child.ProfileHome -> {
                ProfileHomeScreen(component = instance.component)
            }

            is ProfileComponent.Child.ProfileDetails -> {
                ProfileDetailsScreen(component = instance.component)
            }

            is ProfileComponent.Child.Payments -> {
                ProfilePaymentsScreen(component = instance.component)
            }

            is ProfileComponent.Child.PaymentPlans -> {
                ProfilePaymentPlansScreen(component = instance.component)
            }

            is ProfileComponent.Child.Memberships -> {
                ProfileMembershipsScreen(component = instance.component)
            }

            is ProfileComponent.Child.Children -> {
                ProfileChildrenScreen(component = instance.component)
            }

            is ProfileComponent.Child.Documents -> {
                ProfileDocumentsScreen(component = instance.component)
            }
        }
    }
}
