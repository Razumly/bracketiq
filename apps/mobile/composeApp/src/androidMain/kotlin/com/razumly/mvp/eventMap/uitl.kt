package com.razumly.mvp.eventMap

import com.google.android.libraries.places.api.model.Place
import com.google.android.libraries.places.api.net.FetchResolvedPhotoUriRequest
import com.google.android.libraries.places.api.net.PlacesClient
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import io.github.aakira.napier.Napier
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resumeWithException

suspend fun Place.toMVPPlace(placesClient: PlacesClient): MVPPlace = coroutineScope {
    val photoMetadatas = this@toMVPPlace.photoMetadatas?.take(10)
    // If there are photo metadata entries, fetch the URLs concurrently.
    val urls: List<String> = if (!photoMetadatas.isNullOrEmpty()) {
        photoMetadatas.map { metadata ->
            async {
                suspendCancellableCoroutine<String> { cont ->
                    val photoRequest = FetchResolvedPhotoUriRequest.builder(metadata)
                        .setMaxWidth(500)
                        .setMaxHeight(300)
                        .build()
                    placesClient.fetchResolvedPhotoUri(photoRequest)
                        .addOnSuccessListener { photoResponse ->
                            val url = photoResponse.uri?.toString() ?: ""
                            cont.resume(url) { cause, _, _ ->
                                Napier.d { "Cancelled photo fetch: $cause" }
                            }
                        }
                        .addOnFailureListener { exception ->
                            cont.resumeWithException(exception)
                        }
                }
            }
        }.awaitAll()
    } else {
        emptyList()
    }

    MVPPlace(
        name = this@toMVPPlace.displayName ?: "",
        id = this@toMVPPlace.id ?: "",
        lat = this@toMVPPlace.location?.latitude ?: 0.0,
        long = this@toMVPPlace.location?.longitude ?: 0.0,
        imageUrls = urls
    )
}