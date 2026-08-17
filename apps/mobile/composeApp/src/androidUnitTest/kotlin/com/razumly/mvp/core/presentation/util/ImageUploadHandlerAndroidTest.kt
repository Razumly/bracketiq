package com.razumly.mvp.core.presentation.util

import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream
import java.io.InterruptedIOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class ImageUploadHandlerAndroidTest {
    @Test
    fun given_selected_image_when_materialized_then_metadata_and_bytes_are_read_off_the_caller_thread() =
        runBlocking {
            val callerThread = Thread.currentThread()
            val sourceThread = AtomicReference<Thread>()
            val readThread = AtomicReference<Thread>()

            val uploadFile = materializeSelectedImage(
                provideSource = {
                    sourceThread.set(Thread.currentThread())
                    selectedImageSource(
                        inputStream = object : ByteArrayInputStream(byteArrayOf(1, 2, 3)) {
                            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                                readThread.compareAndSet(null, Thread.currentThread())
                                return super.read(buffer, offset, length)
                            }
                        },
                    )
                },
            )

            assertNotEquals(callerThread, assertNotNull(sourceThread.get()))
            assertNotEquals(callerThread, assertNotNull(readThread.get()))
            assertContentEquals(byteArrayOf(1, 2, 3), uploadFile.bytes)
        }

    @Test
    fun given_blocking_selected_image_when_conversion_is_cancelled_then_read_is_interrupted_and_cancellation_propagates() =
        runBlocking {
            val readStarted = CountDownLatch(1)
            val readInterrupted = AtomicBoolean(false)
            val neverReleased = CountDownLatch(1)
            val blockingInput = object : InputStream() {
                override fun read(): Int = read(ByteArray(1), 0, 1)

                override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                    readStarted.countDown()
                    try {
                        neverReleased.await()
                    } catch (interrupted: InterruptedException) {
                        readInterrupted.set(true)
                        throw InterruptedIOException("selected image read interrupted").apply {
                            initCause(interrupted)
                        }
                    }
                    return -1
                }
            }
            val conversion = async(start = CoroutineStart.UNDISPATCHED) {
                materializeSelectedImage(provideSource = {
                    selectedImageSource(inputStream = blockingInput)
                })
            }

            assertTrue(readStarted.await(5, TimeUnit.SECONDS), "The selected image read never started")
            conversion.cancel(CancellationException("picker closed"))

            assertFailsWith<CancellationException> { conversion.await() }
            assertTrue(readInterrupted.get(), "Cancellation did not interrupt the blocking image read")
        }

    @Test
    fun given_selected_image_provider_error_when_materialized_then_original_error_propagates() = runBlocking {
        val expected = IOException("content provider unavailable")

        val thrown = assertFailsWith<IOException> {
            materializeSelectedImage(provideSource = {
                selectedImageSource(
                    inputStreamProvider = { throw expected },
                )
            })
        }

        assertEquals(expected.message, thrown.message)
        assertTrue(
            thrown === expected || thrown.cause === expected,
            "Coroutine recovery should retain the original provider error as the value or cause",
        )
    }

    @Test
    fun given_image_at_exact_server_limit_when_materialized_then_conversion_succeeds() = runBlocking {
        val bytes = ByteArray(MAX_IMAGE_UPLOAD_BYTES) { index -> (index % 251).toByte() }

        val uploadFile = materializeSelectedImage(provideSource = {
            selectedImageSource(
                inputStream = ByteArrayInputStream(bytes),
                declaredSizeBytes = MAX_IMAGE_UPLOAD_BYTES.toLong(),
            )
        })

        assertEquals(MAX_IMAGE_UPLOAD_BYTES, uploadFile.bytes.size)
        assertContentEquals(bytes, uploadFile.bytes)
    }

    @Test
    fun given_stream_over_server_limit_when_materialized_then_conversion_rejects_it() = runBlocking {
        val inputStream = GeneratedInputStream(MAX_IMAGE_UPLOAD_BYTES + 50_000)

        val thrown = assertFailsWith<ImageUploadTooLargeException> {
            materializeSelectedImage(provideSource = {
                selectedImageSource(
                    inputStream = inputStream,
                    declaredSizeBytes = null,
                )
            })
        }

        assertEquals(IMAGE_UPLOAD_TOO_LARGE_MESSAGE, thrown.message)
        assertEquals(MAX_IMAGE_UPLOAD_BYTES + 1, inputStream.bytesRead)
    }

    @Test
    fun given_declared_size_over_server_limit_when_materialized_then_stream_is_never_opened() = runBlocking {
        var streamOpened = false

        assertFailsWith<ImageUploadTooLargeException> {
            materializeSelectedImage(provideSource = {
                selectedImageSource(
                    inputStreamProvider = {
                        streamOpened = true
                        ByteArrayInputStream(byteArrayOf(1))
                    },
                    declaredSizeBytes = MAX_IMAGE_UPLOAD_BYTES.toLong() + 1L,
                )
            })
        }

        assertFalse(streamOpened)
    }

    private fun selectedImageSource(
        inputStream: InputStream? = null,
        inputStreamProvider: (() -> InputStream?)? = null,
        declaredSizeBytes: Long? = null,
    ): SelectedImageSource = SelectedImageSource(
        fileName = "selected.jpg",
        mimeType = "image/jpeg",
        declaredSizeBytes = declaredSizeBytes,
        description = "content://test/selected.jpg",
        openInputStream = inputStreamProvider ?: { inputStream },
    )

    private class GeneratedInputStream(sizeBytes: Int) : InputStream() {
        private var remainingBytes = sizeBytes
        var bytesRead: Int = 0
            private set

        override fun read(): Int {
            if (remainingBytes == 0) return -1
            remainingBytes -= 1
            bytesRead += 1
            return 0
        }

        override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
            if (remainingBytes == 0) return -1
            val readCount = minOf(length, remainingBytes)
            remainingBytes -= readCount
            bytesRead += readCount
            return readCount
        }
    }
}
