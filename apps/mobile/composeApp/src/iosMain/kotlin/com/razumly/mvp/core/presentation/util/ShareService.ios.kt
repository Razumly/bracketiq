package com.razumly.mvp.core.presentation.util

import kotlinx.cinterop.BetaInteropApi
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned
import platform.Foundation.NSData
import platform.Foundation.NSFileManager
import platform.Foundation.NSTemporaryDirectory
import platform.Foundation.NSString
import platform.Foundation.NSURL
import platform.Foundation.create
import platform.UIKit.UIActivityViewController

@OptIn(BetaInteropApi::class, ExperimentalForeignApi::class)
class IOSShareService : ShareService {
    override fun share(title: String, url: String) {
        val activityItems = listOf(
            NSString.create(string = "$title\n$url")
        )
        val activityViewController = UIActivityViewController(activityItems = activityItems, applicationActivities = null)

        topViewController()?.presentViewController(
            viewControllerToPresent = activityViewController,
            animated = true,
            completion = null,
        )
    }

    override fun shareImage(title: String, imageBytes: ByteArray, fileName: String, mimeType: String) {
        if (imageBytes.isEmpty()) return

        val filePath = NSTemporaryDirectory() + fileName
        val fileUrl = NSURL.fileURLWithPath(filePath)
        val didWrite = NSFileManager.defaultManager.createFileAtPath(
            path = filePath,
            contents = imageBytes.toNSData(),
            attributes = null,
        )
        if (!didWrite) return

        val activityViewController = UIActivityViewController(
            activityItems = listOf(fileUrl),
            applicationActivities = null,
        )

        topViewController()?.presentViewController(
            viewControllerToPresent = activityViewController,
            animated = true,
            completion = null,
        )
    }

    private fun ByteArray.toNSData(): NSData = usePinned { pinned ->
        NSData.create(bytes = pinned.addressOf(0), length = size.toULong())
    }
}
actual class ShareServiceProvider {
    actual fun getShareService(): ShareService = IOSShareService()
}
