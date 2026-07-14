package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.MvpUploadFile
import com.razumly.mvp.core.network.configureMvpHttpClient
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class ImagesRepositoryCompensationTest {
    @Test
    fun uploadImageDeletesExactUploadedFileWhenProfileAssociationFails() = runTest {
        val associationFailure = IllegalStateException("profile update failed")
        val requests = mutableListOf<String>()
        val engine = MockEngine { request ->
            requests += "${request.method.value} ${request.url.encodedPath}"
            when {
                request.method == HttpMethod.Get && request.url.encodedPath == "/api/files/upload" -> {
                    respondJson(DEFAULT_IMAGE_UPLOAD_POLICY_JSON)
                }

                request.method == HttpMethod.Post && request.url.encodedPath == "/api/files/upload" -> {
                    respondJson("""{"file":{"id":"$FILE_ID"}}""")
                }

                request.method == HttpMethod.Delete && request.url.encodedPath == "/api/files/$FILE_ID" -> {
                    respondJson("{}")
                }

                else -> error("Unexpected request: ${request.method.value} ${request.url.encodedPath}")
            }
        }
        val userImageStore = FakeUserImageAssociationStore(
            associationResult = Result.failure(associationFailure),
        )
        val repository = ImagesRepository(
            api = imagesTestApi(engine),
            userImageStore = userImageStore,
        )

        val result = repository.uploadImage(
            MvpUploadFile(
                bytes = byteArrayOf(1, 2, 3),
                filename = "profile.jpg",
                mimeType = "image/jpeg",
            ),
        )

        assertSame(associationFailure, result.exceptionOrNull())
        assertEquals(listOf(FILE_ID), userImageStore.addedImageIds)
        assertEquals(1, userImageStore.refreshCurrentAccountCalls)
        assertEquals(
            listOf(
                "GET /api/files/upload",
                "POST /api/files/upload",
                "DELETE /api/files/$FILE_ID",
            ),
            requests,
        )
    }

    @Test
    fun uploadValidationUsesTheServerPolicyInsteadOfACodedMobileAllowlist() = runTest {
        val requests = mutableListOf<String>()
        val engine = MockEngine { request ->
            requests += "${request.method.value} ${request.url.encodedPath}"
            when {
                request.method == HttpMethod.Get && request.url.encodedPath == "/api/files/upload" -> {
                    respondJson(
                        """{
                            "version":2,
                            "maxBytes":10485760,
                            "mimeTypes":["image/gif"],
                            "mimeTypesByExtension":{".gif":"image/gif"},
                            "unsupportedTypeMessage":"Choose a supported image.",
                            "tooLargeMessage":"Choose a smaller image."
                        }""".trimIndent(),
                    )
                }

                request.method == HttpMethod.Post && request.url.encodedPath == "/api/files/upload" -> {
                    respondJson("""{"file":{"id":"$FILE_ID"}}""")
                }

                else -> error("Unexpected request: ${request.method.value} ${request.url.encodedPath}")
            }
        }
        val repository = ImagesRepository(
            api = imagesTestApi(engine),
            userImageStore = FakeUserImageAssociationStore(),
        )

        val result = repository.uploadImage(
            MvpUploadFile(
                bytes = byteArrayOf(71, 73, 70),
                filename = "animated.gif",
                mimeType = "application/octet-stream",
            ),
        )

        assertEquals(FILE_ID, result.getOrThrow())
        assertEquals(
            listOf("GET /api/files/upload", "POST /api/files/upload"),
            requests,
        )
    }

    @Test
    fun unsupportedTypeFailsBeforeMultipartUploadWithTheServerMessage() = runTest {
        val requests = mutableListOf<String>()
        val engine = MockEngine { request ->
            requests += "${request.method.value} ${request.url.encodedPath}"
            when {
                request.method == HttpMethod.Get && request.url.encodedPath == "/api/files/upload" -> {
                    respondJson(DEFAULT_IMAGE_UPLOAD_POLICY_JSON)
                }

                else -> error("Unexpected request: ${request.method.value} ${request.url.encodedPath}")
            }
        }
        val repository = ImagesRepository(
            api = imagesTestApi(engine),
            userImageStore = FakeUserImageAssociationStore(),
        )

        val result = repository.uploadImage(
            MvpUploadFile(
                bytes = byteArrayOf(71, 73, 70),
                filename = "animated.gif",
                mimeType = "image/gif",
            ),
        )

        val failure = assertNotNull(result.exceptionOrNull())
        assertEquals(
            "Unsupported image type. Please select a PNG, JPEG, WebP, AVIF, or SVG image.",
            failure.message,
        )
        assertEquals(listOf("GET /api/files/upload"), requests)
    }

    @Test
    fun successfulAssociationReturnsFileIdWithoutCleanup() = runTest {
        val calls = mutableListOf<String>()
        var cleanupFailureReported = false

        val result = associateUploadedProfileImage(
            fileId = FILE_ID,
            associateImage = { imageId ->
                calls += "associate:$imageId"
                Result.success(Unit)
            },
            deleteImage = { imageId ->
                calls += "delete:$imageId"
                Result.success(Unit)
            },
            reportCleanupFailure = { _, _, _ -> cleanupFailureReported = true },
        )

        assertEquals(FILE_ID, result.getOrThrow())
        assertEquals(listOf("associate:$FILE_ID"), calls)
        assertFalse(cleanupFailureReported)
    }

    @Test
    fun failedAssociationDeletesUploadedFileAndPreservesAssociationFailure() = runTest {
        val associationFailure = IllegalStateException("profile update failed")
        val calls = mutableListOf<String>()
        var cleanupFailureReported = false

        val result = associateUploadedProfileImage(
            fileId = FILE_ID,
            associateImage = { imageId ->
                calls += "associate:$imageId"
                Result.failure(associationFailure)
            },
            deleteImage = { imageId ->
                calls += "delete:$imageId"
                Result.success(Unit)
            },
            reportCleanupFailure = { _, _, _ -> cleanupFailureReported = true },
        )

        assertSame(associationFailure, result.exceptionOrNull())
        assertEquals(listOf("associate:$FILE_ID", "delete:$FILE_ID"), calls)
        assertFalse(cleanupFailureReported)
    }

    @Test
    fun cleanupFailureIsReportedAndSuppressedWithoutMaskingAssociationFailure() = runTest {
        val associationFailure = IllegalStateException("profile update failed")
        val cleanupFailure = IllegalArgumentException("delete failed")
        var reportedFileId: String? = null
        var reportedAssociationFailure: Throwable? = null
        var reportedCleanupFailure: Throwable? = null

        val result = associateUploadedProfileImage(
            fileId = FILE_ID,
            associateImage = { Result.failure(associationFailure) },
            deleteImage = { Result.failure(cleanupFailure) },
            reportCleanupFailure = { fileId, primaryFailure, compensationFailure ->
                reportedFileId = fileId
                reportedAssociationFailure = primaryFailure
                reportedCleanupFailure = compensationFailure
            },
        )

        assertSame(associationFailure, result.exceptionOrNull())
        assertEquals(FILE_ID, reportedFileId)
        assertSame(associationFailure, reportedAssociationFailure)
        assertSame(cleanupFailure, reportedCleanupFailure)
        assertTrue(associationFailure.suppressedExceptions.contains(cleanupFailure))
    }

    @Test
    fun cancellationRemainsPrimaryWhileCleanupRunsUnderNonCancellable() = runTest {
        val associationCancellation = CancellationException("profile association cancelled")
        val cleanupFailure = IllegalStateException("delete failed")
        var result: Result<String>? = null
        var cleanupExecuted = false
        var cleanupContextWasActive = false
        var reportedPrimaryFailure: Throwable? = null

        val worker = launch {
            val workerJob = currentCoroutineContext()[Job]
                ?: error("Cancellation test worker is missing its coroutine job")
            result = associateUploadedProfileImage(
                fileId = FILE_ID,
                associateImage = {
                    workerJob.cancel(associationCancellation)
                    Result.failure(associationCancellation)
                },
                deleteImage = {
                    cleanupExecuted = true
                    cleanupContextWasActive = currentCoroutineContext().isActive
                    Result.failure(cleanupFailure)
                },
                reportCleanupFailure = { _, primaryFailure, _ ->
                    reportedPrimaryFailure = primaryFailure
                },
            )
        }
        worker.join()

        assertFalse(worker.isActive)
        assertTrue(cleanupExecuted)
        assertTrue(cleanupContextWasActive)
        assertSame(associationCancellation, result?.exceptionOrNull())
        assertSame(associationCancellation, reportedPrimaryFailure)
        assertTrue(associationCancellation.suppressedExceptions.contains(cleanupFailure))
    }

    private companion object {
        const val FILE_ID = "profile-image-123"
        const val DEFAULT_IMAGE_UPLOAD_POLICY_JSON = """{
            "version":1,
            "maxBytes":10485760,
            "mimeTypes":["image/avif","image/jpeg","image/jpg","image/png","image/svg+xml","image/webp"],
            "mimeTypesByExtension":{
                ".avif":"image/avif",
                ".jpeg":"image/jpeg",
                ".jpg":"image/jpeg",
                ".png":"image/png",
                ".svg":"image/svg+xml",
                ".webp":"image/webp"
            },
            "unsupportedTypeMessage":"Unsupported image type. Please select a PNG, JPEG, WebP, AVIF, or SVG image.",
            "tooLargeMessage":"Image must be 10MB or less. Choose a smaller image and try again."
        }"""
    }
}

private class FakeUserImageAssociationStore(
    private val associationResult: Result<Unit> = Result.success(Unit),
) : UserImageAssociationStore {
    override val imageIds: Flow<List<String>> = flowOf(emptyList())
    val addedImageIds = mutableListOf<String>()
    var refreshCurrentAccountCalls = 0

    override suspend fun addImage(imageId: String): Result<Unit> {
        addedImageIds += imageId
        return associationResult
    }

    override suspend fun refreshCurrentAccount(): Result<Unit> {
        refreshCurrentAccountCalls += 1
        return Result.success(Unit)
    }
}

private class ImagesTestTokenStore : AuthTokenStore {
    override suspend fun get(): String = "session-token"
    override suspend fun set(token: String) = Unit
    override suspend fun clear() = Unit
}

private fun imagesTestApi(engine: MockEngine): MvpApiClient = MvpApiClient(
    http = HttpClient(engine) { configureMvpHttpClient() },
    baseUrl = "http://example.test",
    tokenStore = ImagesTestTokenStore(),
)

private fun io.ktor.client.engine.mock.MockRequestHandleScope.respondJson(
    content: String,
) = respond(
    content = content,
    status = HttpStatusCode.OK,
    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
)
