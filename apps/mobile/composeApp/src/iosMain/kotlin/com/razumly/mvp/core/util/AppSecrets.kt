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
    val mvpProjectId: String
        get() = getStringResource(
            filename = "Secrets",
            fileType = "plist",
            valueKey = "mvpProjectId"
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