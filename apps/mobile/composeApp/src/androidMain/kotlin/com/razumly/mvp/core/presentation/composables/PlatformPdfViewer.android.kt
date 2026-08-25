package com.razumly.mvp.core.presentation.composables

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
@Composable
actual fun PlatformPdfViewer(
    bytes: ByteArray,
    modifier: Modifier,
) {
    AndroidView(
        modifier = modifier,
        factory = { PdfDocumentView(it) },
        update = { it.show(bytes) },
    )
}

private class PdfDocumentView(context: Context) : ScrollView(context) {
    private val pageContainer = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(Color.WHITE)
    }
    private val renderScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var renderJob: Job? = null
    private var renderGeneration = 0L
    private var displayedDocument: RenderedDocument? = null
    private var renderedBytes: ByteArray? = null
    private var closed = false

    init {
        setBackgroundColor(Color.WHITE)
        addView(
            pageContainer,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT),
        )
    }

    fun show(bytes: ByteArray) {
        if (renderedBytes?.contentEquals(bytes) == true) return

        closed = false
        renderGeneration += 1
        val generation = renderGeneration
        renderJob?.cancel()
        renderJob = null
        renderedBytes = bytes.copyOf()
        displayedDocument?.close()
        displayedDocument = null
        pageContainer.removeAllViews()

        val bytesSnapshot = renderedBytes ?: return
        renderJob = renderScope.launch {
            val renderedDocument = try {
                renderDocument(bytesSnapshot)
            } catch (_: Throwable) {
                return@launch
            }
            withContext(Dispatchers.Main) {
                if (closed || generation != renderGeneration) {
                    renderedDocument.close()
                    return@withContext
                }
                displayedDocument = renderedDocument
                renderedDocument.bitmaps.forEach { bitmap ->
                    pageContainer.addView(
                        ImageView(context).apply {
                            setImageBitmap(bitmap)
                            adjustViewBounds = true
                            scaleType = ImageView.ScaleType.FIT_CENTER
                            layoutParams = LinearLayout.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.WRAP_CONTENT,
                            )
                        },
                    )
                }
            }
        }
    }

    override fun onDetachedFromWindow() {
        close()
        super.onDetachedFromWindow()
    }

    private fun close() {
        closed = true
        renderGeneration += 1
        renderJob?.cancel()
        pageContainer.removeAllViews()
        displayedDocument?.close()
        displayedDocument = null
        renderedBytes = null
    }

    private suspend fun renderDocument(bytes: ByteArray): RenderedDocument {
        currentCoroutineContext().ensureActive()
        val file = File.createTempFile("profile-document-", ".pdf", context.cacheDir)
        val bitmaps = mutableListOf<Bitmap>()
        return try {
            file.writeBytes(bytes)
            ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
                PdfRenderer(descriptor).use { renderer ->
                    repeat(renderer.pageCount) { index ->
                        currentCoroutineContext().ensureActive()
                        renderer.openPage(index).use { page ->
                            val width = maxOf(page.width, 1)
                            val height = maxOf(page.height, 1)
                            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                            bitmap.eraseColor(Color.WHITE)
                            page.render(
                                bitmap,
                                null,
                                null,
                                PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY,
                            )
                            bitmaps += bitmap
                        }
                    }
                }
            }
            RenderedDocument(file, bitmaps)
        } catch (error: Throwable) {
            bitmaps.forEach(Bitmap::recycle)
            file.delete()
            throw error
        }
    }

    private data class RenderedDocument(
        val file: File,
        val bitmaps: List<Bitmap>,
    ) {
        fun close() {
            bitmaps.forEach(Bitmap::recycle)
            file.delete()
        }
    }
}
