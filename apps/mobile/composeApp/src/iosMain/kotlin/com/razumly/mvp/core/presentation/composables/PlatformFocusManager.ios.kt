package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.interop.UIKitView
import kotlinx.cinterop.*
import platform.Foundation.*
import platform.UIKit.*
import platform.darwin.NSObject
import platform.objc.*
import kotlin.experimental.ExperimentalNativeApi

// PlatformFocusManager.ios.kt
class IOSFocusManager : PlatformFocusManager {
    private var _focusState by mutableStateOf(PlatformFocusState())
    private var onFocusChangedCallback: ((Boolean) -> Unit)? = null
    private var onNextCallback: (() -> Unit)? = null
    private var onDoneCallback: (() -> Unit)? = null
    private var currentTextField: UITextField? = null

    override val focusState: PlatformFocusState
        get() = _focusState

    override fun requestFocus() {
        currentTextField?.becomeFirstResponder()
    }

    override fun clearFocus() {
        currentTextField?.resignFirstResponder()
        // Also dismiss any keyboard that might be showing
        dismissKeyboardGlobally()
    }

    @OptIn(ExperimentalNativeApi::class)
    private fun dismissKeyboardGlobally() {
        val application = UIApplication.sharedApplication
        val scenes = application.connectedScenes

        // Find the active window scene
        val activeWindowScene = scenes.firstOrNull { scene ->
            scene is UIWindowScene && scene.activationState == UISceneActivationStateForegroundActive
        } as? UIWindowScene

        // For iOS 15+ use the keyWindow property
        if (activeWindowScene != null) {
            // Try to get the key window using the modern approach
            val keyWindow = if (kotlin.native.Platform.osFamily == kotlin.native.OsFamily.IOS) {
                // For iOS 15+, use the keyWindow property of UIWindowScene
                activeWindowScene.keyWindow
            } else {
                null
            }

            // If keyWindow is available, use it
            if (keyWindow != null) {
                keyWindow.endEditing(true)
            } else {
                // Fallback: iterate through all windows and end editing on each
                activeWindowScene.windows.forEach { window ->
                }
            }
        } else {
            // Ultimate fallback: use the legacy approach for older iOS versions
            @Suppress("DEPRECATION")
            application.keyWindow?.endEditing(true)
        }
    }


    fun dismissKeyboard() {
        dismissKeyboardGlobally()
    }

    override fun setFocusChangeListener(onFocusChanged: (Boolean) -> Unit) {
        onFocusChangedCallback = onFocusChanged
    }

    override fun setOnNextAction(onNext: () -> Unit) {
        onNextCallback = onNext
    }

    override fun setOnDoneAction(onDone: () -> Unit) {
        onDoneCallback = onDone
    }

    override fun clearCallbacks() {
        onFocusChangedCallback = null
        onNextCallback = null
        onDoneCallback = null
    }

    // Internal methods
    internal fun attachToTextField(textField: UITextField) {
        currentTextField = textField
    }

    internal fun updateFocusState(isFocused: Boolean) {
        _focusState = _focusState.copy(isFocused = isFocused)
        onFocusChangedCallback?.invoke(isFocused)
    }

    internal fun handleNextAction() {
        onNextCallback?.invoke()
    }

    internal fun handleDoneAction() {
        onDoneCallback?.invoke()
    }
}

@Composable
actual fun rememberPlatformFocusManager(): PlatformFocusManager {
    return remember { IOSFocusManager() }
}

actual fun Modifier.platformFocusable(
    focusManager: PlatformFocusManager,
    enabled: Boolean
): Modifier {
    // For iOS, the focus handling is done within the UITextField creation
    // This modifier is mainly for consistency with Android
    return this
}

// Enhanced TextField delegate for focus management
class FocusAwareTextFieldDelegate(
    private val onTextChanged: (String) -> Unit,
    private val focusManager: IOSFocusManager
) : NSObject(), UITextFieldDelegateProtocol {

    @OptIn(ExperimentalForeignApi::class)
    override fun textField(
        textField: UITextField,
        shouldChangeCharactersInRange: CValue<NSRange>,
        replacementString: String
    ): Boolean {
        val currentText = textField.text ?: ""
        val newText = (currentText as NSString).stringByReplacingCharactersInRange(
            shouldChangeCharactersInRange,
            replacementString
        )
        onTextChanged(newText)
        return true
    }

    override fun textFieldDidBeginEditing(textField: UITextField) {
        focusManager.updateFocusState(true)
    }

    override fun textFieldDidEndEditing(textField: UITextField) {
        focusManager.updateFocusState(false)
    }

    override fun textFieldShouldReturn(textField: UITextField): Boolean {
        textField.resignFirstResponder()
        return true
    }
}