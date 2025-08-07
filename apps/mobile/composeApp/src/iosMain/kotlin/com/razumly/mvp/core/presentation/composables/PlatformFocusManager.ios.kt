package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.interop.UIKitView
import kotlinx.cinterop.*
import platform.Foundation.*
import platform.UIKit.*
import platform.darwin.NSObject
import platform.objc.*

class IOSFocusManager : PlatformFocusManager {
    private var _focusState by mutableStateOf(PlatformFocusState())
    private var onFocusChangedCallback: ((Boolean) -> Unit)? = null
    private var currentTextField: UITextField? = null

    override val focusState: PlatformFocusState
        get() = _focusState

    override fun requestFocus() {
        currentTextField?.becomeFirstResponder()
    }

    override fun clearFocus() {
        currentTextField?.resignFirstResponder()
    }

    override fun setFocusChangeListener(onFocusChanged: (Boolean) -> Unit) {
        onFocusChangedCallback = onFocusChanged
    }

    internal fun attachToTextField(textField: UITextField) {
        currentTextField = textField
    }

    internal fun updateFocusState(isFocused: Boolean) {
        _focusState = _focusState.copy(isFocused = isFocused)
        onFocusChangedCallback?.invoke(isFocused)
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
