package com.razumly.mvp.core.util

import platform.Foundation.NSBundle
import platform.Foundation.NSDictionary
import platform.Foundation.dictionaryWithContentsOfFile


object AppSecrets {
    val googleMapsApiKey: String
        get() = getStringResource(
            filename = "Secrets",
            fileType = "plist",
            valueKey = "googleMapsApiKey"
        ) ?: ""
    val googlePlacesApiKey: String
        get() = getStringResource(
            filename = "Secrets",
            fileType = "plist",
            valueKey = "googlePlacesApiKey"
        ) ?: ""
    val mvpProjectId: String
        get() = getStringResource(
            filename = "Secrets",
            fileType = "plist",
            valueKey = "mvpProjectId"
        ) ?: ""

    // Next.js API base URL, e.g. "http://localhost:3000" for the iOS simulator.
    val mvpApiBaseUrl: String
        get() = getStringResource(
            filename = "Secrets",
            fileType = "plist",
            valueKey = "mvpApiBaseUrl"
        ) ?: ""
}

internal fun getStringResource(
    filename: String,
    fileType: String,
    valueKey: String,
): String? {
    val result = NSBundle.mainBundle.pathForResource(filename, fileType)?.let {
        val map = NSDictionary.dictionaryWithContentsOfFile(it)
        map?.get(valueKey) as? String
    }
    return result
}
