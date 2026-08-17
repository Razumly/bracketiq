package com.razumly.mvp.teamManagement

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.ObjCObjectVar
import kotlinx.cinterop.alloc
import kotlinx.cinterop.memScoped
import kotlinx.cinterop.ptr
import kotlinx.cinterop.value
import platform.Contacts.CNAuthorizationStatusAuthorized
import platform.Contacts.CNAuthorizationStatusDenied
import platform.Contacts.CNAuthorizationStatusNotDetermined
import platform.Contacts.CNAuthorizationStatusRestricted
import platform.Contacts.CNContact
import platform.Contacts.CNContactEmailAddressesKey
import platform.Contacts.CNContactFamilyNameKey
import platform.Contacts.CNContactFetchRequest
import platform.Contacts.CNContactGivenNameKey
import platform.Contacts.CNContactIdentifierKey
import platform.Contacts.CNContactPhoneNumbersKey
import platform.Contacts.CNContactStore
import platform.Contacts.CNEntityType
import platform.Contacts.CNLabeledValue
import platform.Contacts.CNPhoneNumber
import platform.Foundation.NSError
import platform.Foundation.NSURL
import platform.UIKit.UIApplication
import platform.UIKit.UIApplicationOpenSettingsURLString
import platform.darwin.dispatch_async
import platform.darwin.dispatch_get_main_queue

@OptIn(ExperimentalForeignApi::class)
private class IosContactAccessService : ContactAccessService {
    private val store = CNContactStore()

    override fun permissionStatus(): ContactPermissionStatus = when (
        CNContactStore.authorizationStatusForEntityType(CNEntityType.CNEntityTypeContacts)
    ) {
        CNAuthorizationStatusAuthorized -> ContactPermissionStatus.GRANTED
        CNAuthorizationStatusNotDetermined -> ContactPermissionStatus.NOT_DETERMINED
        CNAuthorizationStatusDenied,
        CNAuthorizationStatusRestricted,
        -> ContactPermissionStatus.DENIED_PERMANENTLY
        else -> ContactPermissionStatus.DENIED
    }

    override fun requestPermission(onResult: (ContactPermissionStatus) -> Unit) {
        if (permissionStatus() != ContactPermissionStatus.NOT_DETERMINED) {
            onResult(permissionStatus())
            return
        }
        store.requestAccessForEntityType(CNEntityType.CNEntityTypeContacts) { _, _ ->
            dispatch_async(dispatch_get_main_queue()) {
                onResult(permissionStatus())
            }
        }
    }

    override suspend fun loadContacts(): Result<List<DeviceContact>> = withContext(Dispatchers.Default) {
        runCatching {
            check(permissionStatus() == ContactPermissionStatus.GRANTED) {
                "Contacts permission is not granted."
            }
            val contacts = mutableListOf<DeviceContact>()
            val request = CNContactFetchRequest(
                keysToFetch = listOf(
                    CNContactIdentifierKey,
                    CNContactGivenNameKey,
                    CNContactFamilyNameKey,
                    CNContactEmailAddressesKey,
                    CNContactPhoneNumbersKey,
                ),
            )
            memScoped {
                val error = alloc<ObjCObjectVar<NSError?>>().apply { value = null }
                val succeeded = store.enumerateContactsWithFetchRequest(
                    fetchRequest = request,
                    error = error.ptr,
                ) { contact: CNContact?, _ ->
                    if (contact != null) {
                        val emails = contact.emailAddresses.mapNotNull { value ->
                            ((value as? CNLabeledValue)?.value as? String)?.trim()
                        }
                        val phones = contact.phoneNumbers.mapNotNull { value ->
                            (((value as? CNLabeledValue)?.value as? CNPhoneNumber)?.stringValue)?.trim()
                        }
                        contacts += DeviceContact(
                            id = contact.identifier,
                            firstName = contact.givenName,
                            lastName = contact.familyName,
                            displayName = "${contact.givenName} ${contact.familyName}".trim(),
                            emails = emails,
                            phones = phones,
                        )
                    }
                }
                if (!succeeded) {
                    error.value?.let { throw IllegalStateException(it.localizedDescription) }
                }
            }
            normalizeDeviceContacts(contacts)
        }
    }

    override fun openAppSettings() {
        NSURL.URLWithString(UIApplicationOpenSettingsURLString)?.let { url ->
            UIApplication.sharedApplication.openURL(
                url = url,
                options = emptyMap<Any?, Any?>(),
                completionHandler = null,
            )
        }
    }
}

@Composable
actual fun rememberContactAccessService(): ContactAccessService =
    remember { IosContactAccessService() }
