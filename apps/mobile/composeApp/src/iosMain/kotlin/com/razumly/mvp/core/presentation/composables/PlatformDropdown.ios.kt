package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.UIKitView
import kotlinx.cinterop.*
import platform.CoreGraphics.CGRectMake
import platform.Foundation.*
import platform.UIKit.*
import platform.UIKit.UIBarButtonItem
import platform.darwin.NSObject
import platform.objc.OBJC_ASSOCIATION_RETAIN_NONATOMIC
import platform.objc.objc_setAssociatedObject
import platform.objc.sel_registerName

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
    val fieldHeight = height ?: 44.dp
    val paddingModifier = if (contentPadding != null) {
        Modifier.padding(contentPadding)
    } else {
        Modifier
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

        // Native iOS dropdown using UIButton + UIMenu
        UIKitView(
            factory = {
                createNativeDropdownButton(
                    selectedValue = if (multiSelect) selectedValues.joinToString(", ") else selectedValue,
                    placeholder = placeholder,
                    options = options,
                    enabled = enabled,
                    multiSelect = multiSelect,
                    selectedValues = selectedValues,
                    onSingleSelectionChange = onSelectionChange,
                    onMultiSelectionChange = onMultiSelectionChange
                )
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(fieldHeight)
                .clip(RoundedCornerShape(9.dp)),
            update = { button ->
                updateNativeDropdownButton(
                    button = button,
                    selectedValue = if (multiSelect) selectedValues.joinToString(", ") else selectedValue,
                    placeholder = placeholder,
                    options = options,
                    enabled = enabled,
                    multiSelect = multiSelect,
                    selectedValues = selectedValues,
                    onSingleSelectionChange = onSelectionChange,
                    onMultiSelectionChange = onMultiSelectionChange
                )
            }
        )

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
    val selectedValues: List<String>
)

@OptIn(ExperimentalForeignApi::class)
fun createNativeDropdownButton(
    selectedValue: String,
    placeholder: String,
    options: List<DropdownOption>,
    enabled: Boolean,
    multiSelect: Boolean,
    selectedValues: List<String>,
    onSingleSelectionChange: (String) -> Unit,
    onMultiSelectionChange: (List<String>) -> Unit
): UIButton {
    // Create the button
    val button = UIButton.buttonWithType(UIButtonTypeSystem)

    // Set initial title
    val displayText = selectedValue.ifEmpty { placeholder }
    button.setTitle(displayText, forState = UIControlStateNormal)

    // Style the button to look like a dropdown field
    button.backgroundColor = UIColor.clearColor
    button.layer.borderWidth = 1.0
    button.layer.borderColor = UIColor.systemGray4Color.CGColor
    button.layer.cornerRadius = 8.0
    button.contentHorizontalAlignment = UIControlContentHorizontalAlignmentLeft
    button.contentEdgeInsets = UIEdgeInsetsMake(0.0, 12.0, 0.0, 32.0)
    button.titleLabel?.font = UIFont.systemFontOfSize(16.0)
    button.setTitleColor(UIColor.labelColor, forState = UIControlStateNormal)
    button.enabled = enabled

    // Add dropdown arrow
    val arrowImageView = UIImageView()
    val arrowImage = UIImage.systemImageNamed("chevron.down")
    arrowImageView.image = arrowImage
    arrowImageView.tintColor = UIColor.systemGrayColor
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
        selectedValues = selectedValues
    )

    objc_setAssociatedObject(
        button as Any,
        "dropdownCallbacks".cstr as CValuesRef<*>?,
        StableRef.create(callbacks).asCPointer(),
        OBJC_ASSOCIATION_RETAIN_NONATOMIC
    )

    // Create UIMenu for the dropdown
    updateButtonMenu(button, options, callbacks)

    return button
}

@OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)
fun updateButtonMenu(
    button: UIButton,
    options: List<DropdownOption>,
    callbacks: DropdownCallbacks
) {
    if (callbacks.multiSelect) {
        // For multiselect, use action sheet approach instead of menu
        button.showsMenuAsPrimaryAction = false
        button.menu = null

        // Remove any existing targets
        button.removeTarget(null, action = null, forControlEvents = UIControlEventAllEvents)

        // Add target for multiselect action sheet
        val target = object : NSObject() {
            @ObjCAction
            @Suppress("UNUSED")
            fun showMultiSelectSheet() {
                showMultiSelectActionSheet(
                    button = button,
                    options = options,
                    selectedValues = callbacks.selectedValues,
                    onSelectionChange = callbacks.onMultiSelectionChange
                )
            }
        }

        button.addTarget(
            target = target,
            action = sel_registerName("showMultiSelectSheet"),
            forControlEvents = UIControlEventTouchUpInside
        )

        // Store target to prevent garbage collection
        objc_setAssociatedObject(
            button as Any,
            "actionTarget".cstr as CValuesRef<*>?,
            StableRef.create(target).asCPointer(),
            OBJC_ASSOCIATION_RETAIN_NONATOMIC
        )
    } else {
        // Single select uses the normal menu approach
        val menuActions = mutableListOf<UIAction>()

        options.forEach { option ->
            val action = UIAction.actionWithTitle(
                title = option.label,
                image = null,
                identifier = null
            ) { _ ->
                callbacks.onSingleSelectionChange(option.value)
                button.setTitle(option.label, forState = UIControlStateNormal)
            }

            if (!option.enabled) {
                action.attributes = UIMenuElementAttributesDisabled
            }

            menuActions.add(action)
        }

        val menu = UIMenu.menuWithTitle(
            title = "",
            children = menuActions
        )

        button.menu = menu
        button.showsMenuAsPrimaryAction = true
    }
}

fun showMultiSelectActionSheet(
    button: UIButton,
    options: List<DropdownOption>,
    selectedValues: List<String>,
    onSelectionChange: (List<String>) -> Unit
) {
    val rootViewController = button.window?.rootViewController ?: return

    val multiSelectVC = createMultiSelectViewController(
        options = options,
        selectedValues = selectedValues,
        onSelectionChange = onSelectionChange,
        onDismiss = { finalSelection ->
            // Update button title when done
            val displayText = if (finalSelection.isEmpty()) {
                "Select options"
            } else {
                finalSelection.mapNotNull { value ->
                    options.find { it.value == value }?.label
                }.joinToString(", ")
            }
            button.setTitle(displayText, forState = UIControlStateNormal)
        }
    )

    rootViewController.presentViewController(multiSelectVC, animated = true, completion = null)
}

@OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)
fun createMultiSelectViewController(
    options: List<DropdownOption>,
    selectedValues: List<String>,
    onSelectionChange: (List<String>) -> Unit,
    onDismiss: (List<String>) -> Unit
): UIViewController {
    val viewController = UIViewController()
    val mutableSelection = selectedValues.toMutableList()

    // Create navigation controller wrapper
    val navController = UINavigationController(rootViewController = viewController)

    // Set up the view
    viewController.view.backgroundColor = UIColor.systemBackgroundColor
    viewController.title = "Select Options"

    val doneButton = UIBarButtonItem(
        title = "Done",
        style = UIBarButtonItemStyle.UIBarButtonItemStyleDone,
        target = viewController,
        action = sel_registerName("donePressed")
    )
    viewController.navigationItem.rightBarButtonItem = doneButton

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
    val tableDelegate = MultiSelectTableDelegate(
        options = options,
        selectedValues = mutableSelection,
        onSelectionChange = { newSelection ->
            mutableSelection.clear()
            mutableSelection.addAll(newSelection)
            onSelectionChange(mutableSelection.toList())
        }
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
    doneButton.target = target
    doneButton.action = sel_registerName("donePressed")
    cancelButton.target = target
    cancelButton.action = sel_registerName("cancelPressed")

    return navController
}

class MultiSelectTableDelegate(
    private val options: List<DropdownOption>,
    private val selectedValues: MutableList<String>,
    private val onSelectionChange: (List<String>) -> Unit
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

        // Fix: Use 'cellForRowAtIndexPath' parameter name
        val option = options[cellForRowAtIndexPath.row.toInt()]
        cell.textLabel?.text = option.label

        // Set checkmark if selected
        if (selectedValues.contains(option.value)) {
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

        // Fix: Use 'didSelectRowAtIndexPath' parameter name
        val option = options[didSelectRowAtIndexPath.row.toInt()]
        if (!option.enabled) return

        // Toggle selection
        if (selectedValues.contains(option.value)) {
            selectedValues.remove(option.value)
        } else {
            selectedValues.add(option.value)
        }

        // Update the cell
        val cell = tableView.cellForRowAtIndexPath(didSelectRowAtIndexPath)
        cell?.accessoryType = if (selectedValues.contains(option.value)) {
            UITableViewCellAccessoryType.UITableViewCellAccessoryCheckmark
        } else {
            UITableViewCellAccessoryType.UITableViewCellAccessoryNone
        }

        // Notify of change
        onSelectionChange(selectedValues.toList())
    }
}



@OptIn(ExperimentalForeignApi::class)
fun updateNativeDropdownButton(
    button: UIButton,
    selectedValue: String,
    placeholder: String,
    options: List<DropdownOption>,
    enabled: Boolean,
    multiSelect: Boolean,
    selectedValues: List<String>,
    onSingleSelectionChange: (String) -> Unit,
    onMultiSelectionChange: (List<String>) -> Unit
) {
    // Update button title
    val displayText = selectedValue.ifEmpty { placeholder }
    if (button.currentTitle != displayText) {
        button.setTitle(displayText, forState = UIControlStateNormal)
    }

    button.enabled = enabled
    button.backgroundColor = UIColor.clearColor

    // Update stored callbacks
    val callbacks = DropdownCallbacks(
        onSingleSelectionChange = onSingleSelectionChange,
        onMultiSelectionChange = onMultiSelectionChange,
        multiSelect = multiSelect,
        selectedValues = selectedValues
    )

    objc_setAssociatedObject(
        button as Any,
        "dropdownCallbacks".cstr as CValuesRef<*>?,
        StableRef.create(callbacks).asCPointer(),
        OBJC_ASSOCIATION_RETAIN_NONATOMIC
    )

    // Update the menu with current callbacks
    updateButtonMenu(button, options, callbacks)
}
