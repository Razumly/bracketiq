package com.razumly.mvp.core.data.repositories

/**
 * Conservative upper bound for comma-separated ID filters sent to collection APIs.
 *
 * The server may enforce a lower per-request result limit, so callers should use these
 * chunks rather than treating one large response as an authoritative collection snapshot.
 */
const val MAX_COLLECTION_IDS_PER_REQUEST = 100

/**
 * Normalizes, de-duplicates, and splits ID filters into request-safe batches.
 */
fun collectionIdChunks(
    ids: Iterable<String>,
    maxIdsPerRequest: Int = MAX_COLLECTION_IDS_PER_REQUEST,
): List<List<String>> {
    require(maxIdsPerRequest > 0) { "maxIdsPerRequest must be greater than zero." }

    return ids
        .asSequence()
        .map(String::trim)
        .filter(String::isNotBlank)
        .distinct()
        .chunked(maxIdsPerRequest)
        .toList()
}
