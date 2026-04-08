@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.UIKitView
import kotlinx.cinterop.CValuesRef
import kotlinx.cinterop.ObjCAction
import kotlinx.cinterop.cstr
import platform.AuthenticationServices.ASAuthorizationAppleIDButton
import platform.UIKit.UIControlEventTouchUpInside
import platform.darwin.NSObject
import platform.objc.OBJC_ASSOCIATION_RETAIN_NONATOMIC
import platform.objc.objc_setAssociatedObject
import platform.objc.sel_registerName

@Composable
internal fun AppleSignInButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    UIKitView(
        factory = {
            createAppleSignInButton(onClick)
        },
        modifier = modifier
            .fillMaxWidth()
            .height(50.dp),
    )
}

private fun createAppleSignInButton(onClick: () -> Unit): ASAuthorizationAppleIDButton {
    val button = ASAuthorizationAppleIDButton()
    button.cornerRadius = 25.0

    val target = AppleSignInButtonTarget(onClick = onClick)
    button.addTarget(
        target = target,
        action = sel_registerName("didTapAppleButton"),
        forControlEvents = UIControlEventTouchUpInside,
    )
    objc_setAssociatedObject(
        button as Any,
        "appleSignInButtonTarget".cstr as CValuesRef<*>?,
        target,
        OBJC_ASSOCIATION_RETAIN_NONATOMIC,
    )

    return button
}

private class AppleSignInButtonTarget(
    private val onClick: () -> Unit,
) : NSObject() {
    @ObjCAction
    @Suppress("UNUSED")
    fun didTapAppleButton() {
        onClick()
    }
}
