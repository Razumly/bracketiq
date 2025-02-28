package com.razumly.mvp

import io.appwrite.Client
import io.appwrite.WebAuthComponent
import io.appwrite.models.InputFile
import io.appwrite.services.Account
import io.appwrite.services.Storage
import io.appwrite.enums.OAuthProvider
import platform.Foundation.*
import kotlinx.cinterop.*
import kotlinx.coroutines.test.runTest
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import platform.Foundation.NSBundle
import kotlin.test.Test

class AppwriteTest: BaseTest(), KoinComponent {
    private val client: Client by inject()

    @OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)
    fun copyResourceToTemp(resourceName: String, ext: String): String {
        // Get the resource from the bundle
        val bundle = NSBundle.mainBundle
        val resourceBasePath = bundle.resourcePath
            ?: throw IllegalStateException("Resource path not available in the bundle.")

        // Construct the absolute path by appending the subdirectory where your resources are bundled.
        val sourcePath = "$resourceBasePath/compose-resources/$resourceName.$ext"

        // Get the temporary directory as an NSString
        val tempDir = NSTemporaryDirectory() // returns a String
        // Convert to NSString so we can use stringByAppendingPathComponent
        val tempDirNSString = tempDir as NSString
        // Create a destination path in the temporary directory
        val destPath = tempDirNSString.stringByAppendingPathComponent("$resourceName.$ext")

        // Use NSFileManager to copy the file if it isn't already there
        val fileManager = NSFileManager.defaultManager
        if (!fileManager.fileExistsAtPath(destPath)) {
            val errorPtr = nativeHeap.alloc<ObjCObjectVar<NSError?>>().apply { value = null }
            fileManager.copyItemAtPath(sourcePath, destPath, errorPtr.ptr)
            errorPtr.value?.let { error ->
                throw IllegalStateException("Error copying resource: ${error.localizedDescription}")
            }
            nativeHeap.free(errorPtr)
        }
        return destPath
    }

    @Test
    fun appwriteTest() = runTest {
        val storage = Storage(client)
        val account = Account(client)
        try {
            account.get()
        } catch (e: Exception) {
            account.createEmailPasswordSession("camka14@gmail.com", "***REMOVED***")
        }

        val filePath = copyResourceToTemp("large_file", "mp4")
        val file = InputFile.fromPath(filePath)

        storage.createFile(
            bucketId = "testid",
            fileId = "test123",
            file = file,
        )
    }
}