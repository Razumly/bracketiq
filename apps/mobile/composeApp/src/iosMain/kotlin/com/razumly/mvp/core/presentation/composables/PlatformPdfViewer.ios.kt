@file:OptIn(kotlinx.cinterop.BetaInteropApi::class, kotlinx.cinterop.ExperimentalForeignApi::class)

package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.UIKitView
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned
import platform.CoreGraphics.CGRectMake
import platform.Foundation.NSData
import platform.Foundation.create
import platform.PDFKit.PDFDocument
import platform.PDFKit.PDFView
import platform.UIKit.UIColor

@Composable
actual fun PlatformPdfViewer(
    bytes: ByteArray,
    modifier: Modifier,
) {
    UIKitView(
        modifier = modifier,
        factory = {
            NativePdfView().apply { setPdfBytes(bytes) }
        },
        update = { pdfView ->
            pdfView.setPdfBytes(bytes)
        },
    )
}

private class NativePdfView : PDFView(frame = CGRectMake(0.0, 0.0, 0.0, 0.0)) {
    private var renderedBytes: ByteArray? = null

    init {
        autoScales = true
        backgroundColor = UIColor.whiteColor
    }

    fun setPdfBytes(bytes: ByteArray) {
        if (bytes.isEmpty()) {
            if (renderedBytes != null || document != null) {
                renderedBytes = null
                document = null
            }
            return
        }
        if (document != null && renderedBytes?.contentEquals(bytes) == true) return
        document = PDFDocument(data = bytes.toNSData())
        renderedBytes = bytes.copyOf()
    }
}

private fun ByteArray.toNSData(): NSData = usePinned { pinned ->
    NSData.create(bytes = pinned.addressOf(0), length = size.toULong())
}
