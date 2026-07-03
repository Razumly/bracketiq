package com.razumly.mvp.core.presentation.composables

import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build
import com.razumly.mvp.BuildConfig
import com.razumly.mvp.MvpApp
import java.security.MessageDigest

internal actual fun billingAddressPlacesApiKey(): String = BuildConfig.MAPS_API_KEY

internal actual fun billingAddressPlacesRequestHeaders(): Map<String, String> {
    val certFingerprint = currentSigningCertificateSha1() ?: return emptyMap()
    return mapOf(
        "X-Android-Package" to BuildConfig.APPLICATION_ID,
        "X-Android-Cert" to certFingerprint,
    )
}

private fun currentSigningCertificateSha1(): String? = runCatching {
    val context = MvpApp.applicationContext()
    val packageManager = context.packageManager
    val packageName = BuildConfig.APPLICATION_ID
    val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        val packageInfo = packageManager.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES)
        val signingInfo = packageInfo.signingInfo ?: return@runCatching null
        if (signingInfo.hasMultipleSigners()) {
            signingInfo.apkContentsSigners
        } else {
            signingInfo.signingCertificateHistory
        }
    } else {
        @Suppress("DEPRECATION")
        packageManager.getPackageInfo(packageName, PackageManager.GET_SIGNATURES).signatures ?: emptyArray()
    }
    signatures.firstOrNull()?.sha1Fingerprint()
}.getOrNull()

private fun Signature.sha1Fingerprint(): String {
    val digest = MessageDigest.getInstance("SHA-1").digest(toByteArray())
    return digest.joinToString(separator = "") { byte -> "%02X".format(byte) }
}
