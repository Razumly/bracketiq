package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.UIKitView
import kotlinx.cinterop.*
import platform.Foundation.*
import platform.UIKit.*
import platform.darwin.NSObject
import platform.objc.*

@Composable
actual fun PlatformTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier,
    label: String,
    placeholder: String,
    isPassword: Boolean,
    keyboardType: String,
    isError: Boolean,
    supportingText: String,
    enabled: Boolean,
    readOnly: Boolean,
    trailingIcon: @Composable (() -> Unit)?,
    leadingIcon: @Composable (() -> Unit)?,
    textStyle: TextStyle?,
    fontSize: TextUnit?,
    height: Dp?,
    contentPadding: PaddingValues?,
    inputFilter: ((String) -> String)?,
    onTap: (() -> Unit)?,
    imeAction: ImeAction,
    externalFocusManager: PlatformFocusManager?
) {
    val focusManager = externalFocusManager ?: rememberPlatformFocusManager()
    val iosFocusManager = focusManager as IOSFocusManager

    val fieldHeight = height ?: 44.dp
    val actualFontSize = fontSize ?: textStyle?.fontSize ?: 16.sp
    val paddingModifier = if (contentPadding != null) {
        Modifier.padding(contentPadding)
    } else {
        Modifier
    }

    Column(modifier = modifier.then(paddingModifier)) {
        // Label above the text field
        if (label.isNotEmpty()) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp)
            )
        }

        // Text field with leading and trailing icons
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Leading icon
            leadingIcon?.let { icon ->
                Box(
                    modifier = Modifier.padding(end = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    icon()
                }
            }

            // For tap-only fields (like date pickers), use a simple clickable Box
            if (onTap != null && readOnly) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(fieldHeight)
                        .background(
                            MaterialTheme.colorScheme.surface,
                            RoundedCornerShape(8.dp)
                        )
                        .border(
                            1.dp,
                            if (isError) MaterialTheme.colorScheme.error
                            else MaterialTheme.colorScheme.outline,
                            RoundedCornerShape(8.dp)
                        )
                        .clickable(onClick = onTap)
                        .padding(horizontal = 12.dp),
                    contentAlignment = Alignment.CenterStart
                ) {
                    Text(
                        text = value.ifEmpty { placeholder },
                        style = MaterialTheme.typography.bodyMedium.copy(
                            fontSize = actualFontSize,
                            color = if (value.isEmpty())
                                MaterialTheme.colorScheme.onSurfaceVariant
                            else
                                MaterialTheme.colorScheme.onSurface
                        )
                    )
                }
            } else {
                // For interactive fields, use UITextField
                UIKitView(
                    factory = {
                        createEnhancedUITextField(
                            placeholder = placeholder,
                            text = value,
                            onTextChanged = { newValue ->
                                val filteredValue = inputFilter?.invoke(newValue) ?: newValue
                                onValueChange(filteredValue)
                            },
                            isSecure = isPassword,
                            keyboardType = keyboardType,
                            enabled = enabled && !readOnly,
                            fontSize = actualFontSize,
                            focusManager = iosFocusManager,
                            imeAction = imeAction
                        )
                    },
                    modifier = Modifier
                        .weight(1f)
                        .height(fieldHeight)
                        .platformFocusable(iosFocusManager, enabled)
                        .clip(RoundedCornerShape(5.dp)),
                    update = { textField ->
                        updateEnhancedUITextField(
                            textField = textField,
                            text = value,
                            placeholder = placeholder,
                            isSecure = isPassword,
                            keyboardType = keyboardType,
                            enabled = enabled && !readOnly,
                            fontSize = actualFontSize,
                            imeAction = imeAction
                        )
                    }
                )
            }

            // Trailing icon
            trailingIcon?.let { icon ->
                Box(
                    modifier = Modifier.padding(start = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    icon()
                }
            }
        }

        // Supporting text below the field
        if (supportingText.isNotEmpty()) {
            Text(
                text = supportingText,
                style = MaterialTheme.typography.bodySmall,
                color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
            )
        }
    }
}

@OptIn(ExperimentalForeignApi::class)
fun createEnhancedUITextField(
    placeholder: String,
    text: String,
    onTextChanged: (String) -> Unit,
    isSecure: Boolean,
    keyboardType: String,
    enabled: Boolean,
    fontSize: TextUnit = 16.sp,
    focusManager: IOSFocusManager,
    imeAction: ImeAction = ImeAction.Next
): UITextField {
    val textField = UITextField()

    // Basic setup
    textField.text = text
    textField.placeholder = placeholder
    textField.borderStyle = UITextBorderStyle.UITextBorderStyleRoundedRect
    textField.secureTextEntry = isSecure
    textField.enabled = enabled

    // Apply font size
    textField.font = UIFont.systemFontOfSize(fontSize.value.toDouble())

    // Set keyboard type
    when (keyboardType) {
        "email" -> textField.keyboardType = UIKeyboardTypeEmailAddress
        "number" -> textField.keyboardType = UIKeyboardTypeNumberPad
        "password" -> {
            textField.keyboardType = UIKeyboardTypeDefault
            textField.secureTextEntry = true
        }

        else -> textField.keyboardType = UIKeyboardTypeDefault
    }

    // Set return key type based on IME action
    textField.returnKeyType = when (imeAction) {
        ImeAction.Next -> UIReturnKeyType.UIReturnKeyNext
        ImeAction.Done -> UIReturnKeyType.UIReturnKeyDone
        ImeAction.Go -> UIReturnKeyType.UIReturnKeyGo
        ImeAction.Send -> UIReturnKeyType.UIReturnKeySend
        else -> UIReturnKeyType.UIReturnKeyDefault
    }

    // Attach focus manager to this text field
    focusManager.attachToTextField(textField)

    // Create enhanced delegate with navigation support
    val delegate = EnhancedNavigationTextFieldDelegate(
        onTextChanged = onTextChanged,
        focusManager = focusManager
    )
    textField.delegate = delegate

    // Store the delegate to prevent garbage collection
    objc_setAssociatedObject(
        textField as Any,
        "textFieldDelegate".cstr as CValuesRef<*>?,
        StableRef.create(delegate).asCPointer(),
        OBJC_ASSOCIATION_RETAIN_NONATOMIC
    )

    return textField
}

fun updateEnhancedUITextField(
    textField: UITextField,
    text: String,
    placeholder: String,
    isSecure: Boolean,
    keyboardType: String,
    enabled: Boolean,
    fontSize: TextUnit = 16.sp,
    imeAction: ImeAction = ImeAction.Next
) {
    // Only update text if different to avoid cursor jumping
    if (textField.text != text) {
        textField.text = text
    }

    textField.placeholder = placeholder
    textField.secureTextEntry = isSecure
    textField.enabled = enabled

    // Apply font size
    textField.font = UIFont.systemFontOfSize(fontSize.value.toDouble())

    // Update keyboard type
    when (keyboardType) {
        "email" -> textField.keyboardType = UIKeyboardTypeEmailAddress
        "number" -> textField.keyboardType = UIKeyboardTypeNumberPad
        "password" -> {
            textField.keyboardType = UIKeyboardTypeDefault
            textField.secureTextEntry = true
        }

        else -> textField.keyboardType = UIKeyboardTypeDefault
    }

    // Update return key type
    textField.returnKeyType = when (imeAction) {
        ImeAction.Next -> UIReturnKeyType.UIReturnKeyNext
        ImeAction.Done -> UIReturnKeyType.UIReturnKeyDone
        ImeAction.Go -> UIReturnKeyType.UIReturnKeyGo
        ImeAction.Send -> UIReturnKeyType.UIReturnKeySend
        else -> UIReturnKeyType.UIReturnKeyDefault
    }
}

class EnhancedNavigationTextFieldDelegate(
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
        when (textField.returnKeyType) {
            UIReturnKeyType.UIReturnKeyNext -> {
                // Execute the next callback through focus manager
                focusManager.handleNextAction()
                return false // Keep keyboard open for next field
            }

            UIReturnKeyType.UIReturnKeyDone, UIReturnKeyType.UIReturnKeyGo, UIReturnKeyType.UIReturnKeySend -> {
                // Execute done callback and dismiss keyboard
                textField.resignFirstResponder()
                focusManager.handleDoneAction()
                return true
            }

            else -> {
                textField.resignFirstResponder()
                return true
            }
        }
    }
}
