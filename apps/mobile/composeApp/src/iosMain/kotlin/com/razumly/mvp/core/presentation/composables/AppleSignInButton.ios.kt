@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.UIKitView
import kotlinx.cinterop.CValuesRef
import kotlinx.cinterop.ObjCAction
import kotlinx.cinterop.cstr
import platform.AuthenticationServices.ASAuthorizationAppleIDButton
import platform.AuthenticationServices.ASAuthorizationAppleIDButtonStyle
import platform.AuthenticationServices.ASAuthorizationAppleIDButtonTypeContinue
import platform.UIKit.UIControlEventTouchUpInside
import platform.darwin.NSObject
import platform.objc.OBJC_ASSOCIATION_RETAIN_NONATOMIC
import platform.objc.objc_setAssociatedObject
import platform.objc.sel_registerName

private val IOS_AUTH_BUTTON_HEIGHT = 50.dp
private const val IOS_AUTH_BUTTON_ASPECT_RATIO = 199f / 44f
private val IOS_AUTH_BUTTON_SHAPE = RoundedCornerShape(IOS_AUTH_BUTTON_HEIGHT / 2)

@Composable
internal fun AppleSignInButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val buttonWidth = IOS_AUTH_BUTTON_HEIGHT * IOS_AUTH_BUTTON_ASPECT_RATIO
    val isDarkTheme = isSystemInDarkTheme()
    val borderColor = if (isDarkTheme) Color(0xFF8E918F) else Color(0xFF747775)
    val backgroundColor = if (isDarkTheme) Color(0xFF131314) else Color.White
    val buttonStyle = if (isDarkTheme) {
        ASAuthorizationAppleIDButtonStyle.ASAuthorizationAppleIDButtonStyleBlack
    } else {
        ASAuthorizationAppleIDButtonStyle.ASAuthorizationAppleIDButtonStyleWhite
    }

    Box(
        modifier = modifier
            .size(buttonWidth, IOS_AUTH_BUTTON_HEIGHT)
            .clip(IOS_AUTH_BUTTON_SHAPE)
            .background(backgroundColor)
            .border(1.dp, borderColor, IOS_AUTH_BUTTON_SHAPE),
        contentAlignment = Alignment.Center,
    ) {
        UIKitView(
            factory = {
                createAppleSignInButton(
                    onClick = onClick,
                    buttonStyle = buttonStyle,
                )
            },
            modifier = Modifier.fillMaxSize(),
        )
    }
}

private fun createAppleSignInButton(
    onClick: () -> Unit,
    buttonStyle: ASAuthorizationAppleIDButtonStyle,
): ASAuthorizationAppleIDButton {
    val button = ASAuthorizationAppleIDButton.buttonWithType(
        ASAuthorizationAppleIDButtonTypeContinue,
        buttonStyle,
    )
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
