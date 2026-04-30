@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.UIKitView
import kotlinx.cinterop.BetaInteropApi
import kotlinx.cinterop.CValuesRef
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.ObjCAction
import kotlinx.cinterop.ObjCSignatureOverride
import kotlinx.cinterop.StableRef
import kotlinx.cinterop.cstr
import platform.Foundation.*
import platform.UIKit.*
import platform.UIKit.UIBarButtonItem
import platform.darwin.NSObject
import platform.objc.OBJC_ASSOCIATION_RETAIN_NONATOMIC
import platform.objc.objc_setAssociatedObject
import platform.objc.sel_registerName

private val LightReadablePlaceholder = Color(0xFF6B7785)
private val LightReadableDisabled = Color(0xFF5E6B78)

@Composable
actual fun PlatformDropdown(
    selectedValue: String,
    onSelectionChange: (String) -> Unit,
    options: List<DropdownOption>,
    modifier: Modifier,
    label: String,
    placeholder: String,
    isError: Boolean,
    supportingText: String,
    enabled: Boolean,
    multiSelect: Boolean,
    selectedValues: List<String>,
    onMultiSelectionChange: (List<String>) -> Unit,
    leadingIcon: @Composable (() -> Unit)?,
    height: Dp?,
    contentPadding: PaddingValues?
) {
    val platformTextFieldVisible = LocalPlatformTextFieldVisible.current
    val fieldHeight = height ?: 44.dp
    val readablePlaceholder = if (isSystemInDarkTheme()) {
        MaterialTheme.colorScheme.onSurfaceVariant
    } else {
        LightReadablePlaceholder
    }
    val readableDisabled = if (isSystemInDarkTheme()) {
        MaterialTheme.colorScheme.onSurfaceVariant
    } else {
        LightReadableDisabled
    }
    val fillColor = MaterialTheme.colorScheme.surface
    val disabledFillColor = MaterialTheme.colorScheme.surfaceContainerLow
    val borderColor = if (isError) {
        MaterialTheme.colorScheme.error
    } else {
        MaterialTheme.colorScheme.outline
    }
    val textUIColor = MaterialTheme.colorScheme.onSurface.toUIColor()
    val placeholderUIColor = readablePlaceholder.toUIColor()
    val disabledTextUIColor = readableDisabled.toUIColor()
    val fillUIColor = fillColor.toUIColor()
    val disabledFillUIColor = disabledFillColor.toUIColor()
    val borderUIColor = borderColor.toUIColor()
    val paddingModifier = if (contentPadding != null) {
        Modifier.padding(contentPadding)
    } else {
        Modifier
    }
    val displayText = dropdownDisplayText(
        selectedValue = selectedValue,
        selectedValues = selectedValues,
        options = options,
        multiSelect = multiSelect,
    )
    val hasSelection = if (multiSelect) selectedValues.isNotEmpty() else selectedValue.isNotBlank()
    val sheetTitle = label.ifBlank {
        if (multiSelect) "Select Options" else "Select Option"
    }

    Column(modifier = modifier.then(paddingModifier)) {
        // Label above the dropdown
        if (label.isNotEmpty()) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp)
            )
        }

        if (!platformTextFieldVisible) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(fieldHeight)
                    .background(fillColor, RoundedCornerShape(8.dp))
                    .border(1.dp, borderColor, RoundedCornerShape(8.dp))
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = displayText.ifBlank { placeholder },
                        style = MaterialTheme.typography.bodyMedium,
                        color = when {
                            !enabled -> readableDisabled
                            !hasSelection -> readablePlaceholder
                            else -> MaterialTheme.colorScheme.onSurface
                        },
                        maxLines = 1,
                    )
                    Text(
                        text = "⌄",
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (enabled) readablePlaceholder else readableDisabled,
                    )
                }
            }
        } else {
            UIKitView(
                factory = {
                    createNativeDropdownButton(
                        displayText = displayText,
                        hasSelection = hasSelection,
                        placeholder = placeholder,
                        sheetTitle = sheetTitle,
                        options = options,
                        enabled = enabled,
                        multiSelect = multiSelect,
                        selectedValue = selectedValue,
                        selectedValues = selectedValues,
                        onSingleSelectionChange = onSelectionChange,
                        onMultiSelectionChange = onMultiSelectionChange,
                        textColor = textUIColor,
                        placeholderColor = placeholderUIColor,
                        disabledTextColor = disabledTextUIColor,
                        fillColor = fillUIColor,
                        disabledFillColor = disabledFillUIColor,
                        borderColor = borderUIColor,
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(fieldHeight)
                    .clip(RoundedCornerShape(9.dp)),
                update = { button ->
                    updateNativeDropdownButton(
                        button = button,
                        displayText = displayText,
                        hasSelection = hasSelection,
                        placeholder = placeholder,
                        sheetTitle = sheetTitle,
                        options = options,
                        enabled = enabled,
                        multiSelect = multiSelect,
                        selectedValue = selectedValue,
                        selectedValues = selectedValues,
                        onSingleSelectionChange = onSelectionChange,
                        onMultiSelectionChange = onMultiSelectionChange,
                        textColor = textUIColor,
                        placeholderColor = placeholderUIColor,
                        disabledTextColor = disabledTextUIColor,
                        fillColor = fillUIColor,
                        disabledFillColor = disabledFillUIColor,
                        borderColor = borderUIColor,
                    )
                }
            )
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

// Store callbacks in a data class to preserve them
data class DropdownCallbacks(
    val onSingleSelectionChange: (String) -> Unit,
    val onMultiSelectionChange: (List<String>) -> Unit,
    val multiSelect: Boolean,
    val placeholder: String,
    val selectedValue: String,
    val selectedValues: List<String>
)

fun createNativeDropdownButton(
    displayText: String,
    hasSelection: Boolean,
    placeholder: String,
    sheetTitle: String,
    options: List<DropdownOption>,
    enabled: Boolean,
    multiSelect: Boolean,
    selectedValue: String,
    selectedValues: List<String>,
    onSingleSelectionChange: (String) -> Unit,
    onMultiSelectionChange: (List<String>) -> Unit,
    textColor: UIColor,
    placeholderColor: UIColor,
    disabledTextColor: UIColor,
    fillColor: UIColor,
    disabledFillColor: UIColor,
    borderColor: UIColor,
): UIButton {
    // Create the button
    val button = UIButton.buttonWithType(UIButtonTypeSystem)

    // Set initial title
    button.setTitle(displayText.ifEmpty { placeholder }, forState = UIControlStateNormal)

    // Style the button to look like a dropdown field
    button.backgroundColor = if (enabled) fillColor else disabledFillColor
    button.layer.borderWidth = 1.0
    button.layer.borderColor = borderColor.CGColor
    button.layer.cornerRadius = 8.0
    button.contentHorizontalAlignment = UIControlContentHorizontalAlignmentLeft
    button.contentEdgeInsets = UIEdgeInsetsMake(0.0, 12.0, 0.0, 32.0)
    button.titleLabel?.font = UIFont.systemFontOfSize(16.0)
    button.setTitleColor(
        when {
            !enabled -> disabledTextColor
            !hasSelection -> placeholderColor
            else -> textColor
        },
        forState = UIControlStateNormal
    )
    button.enabled = enabled

    // Add dropdown arrow
    val arrowImageView = UIImageView()
    val arrowImage = UIImage.systemImageNamed("chevron.down")
    arrowImageView.image = arrowImage
    arrowImageView.tintColor = if (enabled) placeholderColor else disabledTextColor
    arrowImageView.translatesAutoresizingMaskIntoConstraints = false
    button.addSubview(arrowImageView)

    // Position the arrow
    NSLayoutConstraint.activateConstraints(listOf(
        arrowImageView.trailingAnchor.constraintEqualToAnchor(button.trailingAnchor, constant = -12.0),
        arrowImageView.centerYAnchor.constraintEqualToAnchor(button.centerYAnchor),
        arrowImageView.widthAnchor.constraintEqualToConstant(16.0),
        arrowImageView.heightAnchor.constraintEqualToConstant(16.0)
    ))

    // Store callbacks to prevent garbage collection and ensure they persist
    val callbacks = DropdownCallbacks(
        onSingleSelectionChange = onSingleSelectionChange,
        onMultiSelectionChange = onMultiSelectionChange,
        multiSelect = multiSelect,
        placeholder = placeholder,
        selectedValue = selectedValue,
        selectedValues = selectedValues
    )

    objc_setAssociatedObject(
        button as Any,
        "dropdownCallbacks".cstr as CValuesRef<*>?,
        StableRef.create(callbacks).asCPointer(),
        OBJC_ASSOCIATION_RETAIN_NONATOMIC
    )

    updateButtonSelectionAction(button, options, callbacks, sheetTitle)

    return button
}

@OptIn(BetaInteropApi::class)
fun updateButtonSelectionAction(
    button: UIButton,
    options: List<DropdownOption>,
    callbacks: DropdownCallbacks,
    sheetTitle: String,
) {
    button.showsMenuAsPrimaryAction = false
    button.menu = null
    button.removeTarget(null, action = null, forControlEvents = UIControlEventAllEvents)

    val target = object : NSObject() {
        @ObjCAction
        @Suppress("UNUSED")
        fun showSelectionSheet() {
            showSelectionSheet(
                button = button,
                title = sheetTitle,
                options = options,
                selectedValue = callbacks.selectedValue,
                selectedValues = callbacks.selectedValues,
                multiSelect = callbacks.multiSelect,
                placeholder = callbacks.placeholder,
                onSingleSelectionChange = callbacks.onSingleSelectionChange,
                onMultiSelectionChange = callbacks.onMultiSelectionChange,
            )
        }
    }

    button.addTarget(
        target = target,
        action = sel_registerName("showSelectionSheet"),
        forControlEvents = UIControlEventTouchUpInside
    )

    objc_setAssociatedObject(
        button as Any,
        "actionTarget".cstr as CValuesRef<*>?,
        StableRef.create(target).asCPointer(),
        OBJC_ASSOCIATION_RETAIN_NONATOMIC
    )
}

fun showSelectionSheet(
    button: UIButton,
    title: String,
    options: List<DropdownOption>,
    selectedValue: String,
    selectedValues: List<String>,
    multiSelect: Boolean,
    placeholder: String,
    onSingleSelectionChange: (String) -> Unit,
    onMultiSelectionChange: (List<String>) -> Unit
) {
    val rootViewController = button.window?.rootViewController ?: return
    val presentingViewController = rootViewController.topPresentedViewController()

    val selectionVC = createSelectionViewController(
        title = title,
        options = options,
        selectedValue = selectedValue,
        selectedValues = selectedValues,
        multiSelect = multiSelect,
        onSingleSelectionChange = { option ->
            onSingleSelectionChange(option.value)
            button.setTitle(option.label, forState = UIControlStateNormal)
        },
        onMultiSelectionChange = onMultiSelectionChange,
        onDismiss = { finalSelection ->
            val displayText = finalSelection
                .map { value -> options.firstOrNull { it.value == value }?.label ?: value }
                .filter(String::isNotBlank)
                .joinToString(", ")
            button.setTitle(displayText.ifEmpty { placeholder }, forState = UIControlStateNormal)
        }
    )

    presentingViewController.presentViewController(selectionVC, animated = true, completion = null)
}

@OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)
fun createSelectionViewController(
    title: String,
    options: List<DropdownOption>,
    selectedValue: String,
    selectedValues: List<String>,
    multiSelect: Boolean,
    onSingleSelectionChange: (DropdownOption) -> Unit,
    onMultiSelectionChange: (List<String>) -> Unit,
    onDismiss: (List<String>) -> Unit
): UIViewController {
    val viewController = UIViewController()
    val mutableSelection = selectedValues.toMutableList()

    // Create navigation controller wrapper
    val navController = UINavigationController(rootViewController = viewController)

    // Set up the view
    viewController.view.backgroundColor = UIColor.systemBackgroundColor
    viewController.title = title

    val doneButton = if (multiSelect) {
        UIBarButtonItem(
            title = "Done",
            style = UIBarButtonItemStyle.UIBarButtonItemStyleDone,
            target = viewController,
            action = sel_registerName("donePressed")
        ).also { viewController.navigationItem.rightBarButtonItem = it }
    } else {
        null
    }

    val cancelButton = UIBarButtonItem(
        title = "Cancel",
        style = UIBarButtonItemStyle.UIBarButtonItemStylePlain,
        target = viewController,
        action = sel_registerName("cancelPressed")
    )
    viewController.navigationItem.leftBarButtonItem = cancelButton

    // Create table view
    val tableView = UITableView(frame = viewController.view.bounds, style = UITableViewStyle.UITableViewStylePlain)
    tableView.translatesAutoresizingMaskIntoConstraints = false
    viewController.view.addSubview(tableView)

    // Set up constraints
    NSLayoutConstraint.activateConstraints(listOf(
        tableView.topAnchor.constraintEqualToAnchor(viewController.view.safeAreaLayoutGuide.topAnchor),
        tableView.leadingAnchor.constraintEqualToAnchor(viewController.view.leadingAnchor),
        tableView.trailingAnchor.constraintEqualToAnchor(viewController.view.trailingAnchor),
        tableView.bottomAnchor.constraintEqualToAnchor(viewController.view.bottomAnchor)
    ))

    // Create table view delegate/datasource
    val tableDelegate = SelectionTableDelegate(
        options = options,
        selectedValue = selectedValue,
        selectedValues = mutableSelection,
        multiSelect = multiSelect,
        onSingleSelectionChange = { option ->
            onSingleSelectionChange(option)
            viewController.dismissViewControllerAnimated(true, completion = null)
        },
    )

    tableView.delegate = tableDelegate
    tableView.dataSource = tableDelegate

    // Store delegate to prevent garbage collection
    objc_setAssociatedObject(
        viewController as Any,
        "tableDelegate".cstr as CValuesRef<*>?,
        StableRef.create(tableDelegate).asCPointer(),
        OBJC_ASSOCIATION_RETAIN_NONATOMIC
    )

    // Add button actions
    val target = object : NSObject() {
        @ObjCAction
        @Suppress("UNUSED")
        fun donePressed() {
            onMultiSelectionChange(mutableSelection.toList())
            onDismiss(mutableSelection.toList())
            viewController.dismissViewControllerAnimated(true, completion = null)
        }

        @ObjCAction
        @Suppress("UNUSED")
        fun cancelPressed() {
            viewController.dismissViewControllerAnimated(true, completion = null)
        }
    }

    // Store target to prevent garbage collection
    objc_setAssociatedObject(
        viewController as Any,
        "buttonTarget".cstr as CValuesRef<*>?,
        StableRef.create(target).asCPointer(),
        OBJC_ASSOCIATION_RETAIN_NONATOMIC
    )

    // Update button targets
    doneButton?.target = target
    doneButton?.action = sel_registerName("donePressed")
    cancelButton.target = target
    cancelButton.action = sel_registerName("cancelPressed")

    return navController
}

class SelectionTableDelegate(
    private val options: List<DropdownOption>,
    private val selectedValue: String,
    private val selectedValues: MutableList<String>,
    private val multiSelect: Boolean,
    private val onSingleSelectionChange: (DropdownOption) -> Unit,
) : NSObject(), UITableViewDelegateProtocol, UITableViewDataSourceProtocol {

    override fun numberOfSectionsInTableView(tableView: UITableView): Long = 1

    override fun tableView(tableView: UITableView, numberOfRowsInSection: Long): Long =
        options.size.toLong()

    @ObjCSignatureOverride
    override fun tableView(tableView: UITableView, cellForRowAtIndexPath: NSIndexPath): UITableViewCell {
        val identifier = "MultiSelectCell"
        var cell = tableView.dequeueReusableCellWithIdentifier(identifier)

        if (cell == null) {
            cell = UITableViewCell(
                style = UITableViewCellStyle.UITableViewCellStyleDefault,
                reuseIdentifier = identifier
            )
        }

        val option = options[cellForRowAtIndexPath.row.toInt()]
        cell.textLabel?.text = option.label

        val isSelected = if (multiSelect) {
            selectedValues.contains(option.value)
        } else {
            option.value == selectedValue
        }

        if (isSelected) {
            cell.accessoryType = UITableViewCellAccessoryType.UITableViewCellAccessoryCheckmark
        } else {
            cell.accessoryType = UITableViewCellAccessoryType.UITableViewCellAccessoryNone
        }

        // Handle enabled/disabled state
        cell.textLabel?.enabled = option.enabled
        cell.userInteractionEnabled = option.enabled
        cell.textLabel?.textColor = if (option.enabled) {
            UIColor.labelColor
        } else {
            UIColor.secondaryLabelColor
        }

        return cell
    }

    @ObjCSignatureOverride
    override fun tableView(tableView: UITableView, didSelectRowAtIndexPath: NSIndexPath) {
        tableView.deselectRowAtIndexPath(didSelectRowAtIndexPath, animated = true)

        val option = options[didSelectRowAtIndexPath.row.toInt()]
        if (!option.enabled) return

        if (multiSelect) {
            if (selectedValues.contains(option.value)) {
                selectedValues.remove(option.value)
            } else {
                selectedValues.add(option.value)
            }

            val cell = tableView.cellForRowAtIndexPath(didSelectRowAtIndexPath)
            cell?.accessoryType = if (selectedValues.contains(option.value)) {
                UITableViewCellAccessoryType.UITableViewCellAccessoryCheckmark
            } else {
                UITableViewCellAccessoryType.UITableViewCellAccessoryNone
            }
        } else {
            onSingleSelectionChange(option)
        }
    }
}



@OptIn(ExperimentalForeignApi::class)
fun updateNativeDropdownButton(
    button: UIButton,
    displayText: String,
    hasSelection: Boolean,
    placeholder: String,
    sheetTitle: String,
    options: List<DropdownOption>,
    enabled: Boolean,
    multiSelect: Boolean,
    selectedValue: String,
    selectedValues: List<String>,
    onSingleSelectionChange: (String) -> Unit,
    onMultiSelectionChange: (List<String>) -> Unit,
    textColor: UIColor,
    placeholderColor: UIColor,
    disabledTextColor: UIColor,
    fillColor: UIColor,
    disabledFillColor: UIColor,
    borderColor: UIColor,
) {
    // Update button title
    val buttonTitle = displayText.ifEmpty { placeholder }
    if (button.currentTitle != buttonTitle) {
        button.setTitle(buttonTitle, forState = UIControlStateNormal)
    }

    button.enabled = enabled
    button.backgroundColor = if (enabled) fillColor else disabledFillColor
    button.layer.borderColor = borderColor.CGColor
    button.setTitleColor(
        when {
            !enabled -> disabledTextColor
            !hasSelection -> placeholderColor
            else -> textColor
        },
        forState = UIControlStateNormal
    )

    // Update stored callbacks
    val callbacks = DropdownCallbacks(
        onSingleSelectionChange = onSingleSelectionChange,
        onMultiSelectionChange = onMultiSelectionChange,
        multiSelect = multiSelect,
        placeholder = placeholder,
        selectedValue = selectedValue,
        selectedValues = selectedValues
    )

    objc_setAssociatedObject(
        button as Any,
        "dropdownCallbacks".cstr as CValuesRef<*>?,
        StableRef.create(callbacks).asCPointer(),
        OBJC_ASSOCIATION_RETAIN_NONATOMIC
    )

    updateButtonSelectionAction(button, options, callbacks, sheetTitle)
}

private fun dropdownDisplayText(
    selectedValue: String,
    selectedValues: List<String>,
    options: List<DropdownOption>,
    multiSelect: Boolean,
): String {
    return if (multiSelect) {
        selectedValues
            .map { value -> options.firstOrNull { it.value == value }?.label ?: value }
            .filter(String::isNotBlank)
            .joinToString(", ")
    } else {
        selectedValue
            .takeIf(String::isNotBlank)
            ?.let { value -> options.firstOrNull { it.value == value }?.label ?: value }
            .orEmpty()
    }
}

private fun UIViewController.topPresentedViewController(): UIViewController {
    var current = this
    while (current.presentedViewController != null) {
        current = current.presentedViewController!!
    }
    return current
}

private fun Color.toUIColor(): UIColor =
    UIColor.colorWithRed(
        red = red.toDouble(),
        green = green.toDouble(),
        blue = blue.toDouble(),
        alpha = alpha.toDouble(),
    )
