package com.razumly.mvp.teamManagement

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val CONTACT_PERMISSION_PREFERENCES = "contact_permission"
private const val CONTACT_PERMISSION_REQUESTED = "requested"

private class AndroidContactAccessService(
    private val context: Context,
    private val activity: Activity?,
) : ContactAccessService {
    var launchPermissionRequest: (() -> Unit)? = null
    private var permissionResult: ((ContactPermissionStatus) -> Unit)? = null

    override fun permissionStatus(): ContactPermissionStatus {
        if (
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            return ContactPermissionStatus.GRANTED
        }
        val wasRequested = context
            .getSharedPreferences(CONTACT_PERMISSION_PREFERENCES, Context.MODE_PRIVATE)
            .getBoolean(CONTACT_PERMISSION_REQUESTED, false)
        if (!wasRequested) return ContactPermissionStatus.NOT_DETERMINED
        return if (
            activity != null &&
            ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.READ_CONTACTS)
        ) {
            ContactPermissionStatus.DENIED
        } else {
            ContactPermissionStatus.DENIED_PERMANENTLY
        }
    }

    override fun requestPermission(onResult: (ContactPermissionStatus) -> Unit) {
        val status = permissionStatus()
        if (status == ContactPermissionStatus.GRANTED || status == ContactPermissionStatus.DENIED_PERMANENTLY) {
            onResult(status)
            return
        }
        context
            .getSharedPreferences(CONTACT_PERMISSION_PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(CONTACT_PERMISSION_REQUESTED, true)
            .apply()
        permissionResult = onResult
        launchPermissionRequest?.invoke() ?: onResult(ContactPermissionStatus.DENIED)
    }

    fun completePermissionRequest(granted: Boolean) {
        val callback = permissionResult
        permissionResult = null
        callback?.invoke(if (granted) ContactPermissionStatus.GRANTED else permissionStatus())
    }

    override suspend fun loadContacts(): Result<List<DeviceContact>> = withContext(Dispatchers.IO) {
        runCatching {
            check(permissionStatus() == ContactPermissionStatus.GRANTED) {
                "Contacts permission is not granted."
            }
            val builders = linkedMapOf<String, AndroidContactBuilder>()
            val projection = arrayOf(
                ContactsContract.Data.CONTACT_ID,
                ContactsContract.Data.MIMETYPE,
                ContactsContract.Contacts.DISPLAY_NAME_PRIMARY,
                ContactsContract.CommonDataKinds.StructuredName.GIVEN_NAME,
                ContactsContract.CommonDataKinds.StructuredName.FAMILY_NAME,
                ContactsContract.Data.DATA1,
                ContactsContract.CommonDataKinds.Phone.NORMALIZED_NUMBER,
            )
            context.contentResolver.query(
                ContactsContract.Data.CONTENT_URI,
                projection,
                null,
                null,
                ContactsContract.Contacts.SORT_KEY_PRIMARY + " ASC",
            )?.use { cursor ->
                while (cursor.moveToNext()) {
                    val contactId = cursor.getLong(0).toString()
                    val mimeType = cursor.getString(1).orEmpty()
                    val builder = builders.getOrPut(contactId) { AndroidContactBuilder(contactId) }
                    builder.displayName = cursor.getString(2).orEmpty().ifBlank { builder.displayName }
                    when (mimeType) {
                        ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE -> {
                            builder.firstName = cursor.getString(3).orEmpty()
                            builder.lastName = cursor.getString(4).orEmpty()
                        }
                        ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE -> {
                            cursor.getString(5)?.takeIf(String::isNotBlank)?.let(builder.emails::add)
                        }
                        ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE -> {
                            val phone = cursor.getString(6)?.takeIf(String::isNotBlank)
                                ?: cursor.getString(5)?.takeIf(String::isNotBlank)
                            phone?.let(builder.phones::add)
                        }
                    }
                }
            }
            normalizeDeviceContacts(builders.values.map(AndroidContactBuilder::build))
        }
    }

    override fun openAppSettings() {
        context.startActivity(
            Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", context.packageName, null),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}

private class AndroidContactBuilder(private val id: String) {
    var firstName: String = ""
    var lastName: String = ""
    var displayName: String = ""
    val emails = mutableListOf<String>()
    val phones = mutableListOf<String>()

    fun build(): DeviceContact = DeviceContact(
        id = id,
        firstName = firstName,
        lastName = lastName,
        displayName = displayName,
        emails = emails,
        phones = phones,
    )
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

@Composable
actual fun rememberContactAccessService(): ContactAccessService {
    val context = LocalContext.current
    val service = remember(context) {
        AndroidContactAccessService(context.applicationContext, context.findActivity())
    }
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        service.completePermissionRequest(granted)
    }
    SideEffect {
        service.launchPermissionRequest = {
            launcher.launch(Manifest.permission.READ_CONTACTS)
        }
    }
    return service
}
