package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.MVPDocument

interface IMVPRepository {
    companion object {
        suspend fun <T : MVPDocument, R> singleResponse(
            networkCall: suspend () -> T, saveCall: suspend (T) -> Unit, onReturn: suspend (T) -> R
        ): Result<R> {
            return runCatching{
                // Fetch fresh data from network
                val networkResult = networkCall()
                saveCall(networkResult)
                onReturn(networkResult)
            }
        }

        /**
         * Refresh a collection-backed cache and return the resulting local snapshot.
         *
         * A collection response is not assumed to be exhaustive. Callers may provide
         * [authoritativeIds] only when the request explicitly asked for those exact IDs and
         * the server's response is authoritative for their existence. This keeps paged,
         * filtered, and truncated responses from deleting unrelated cached records.
         */
        suspend fun <T : MVPDocument> multiResponse(
            getRemoteData: suspend () -> List<T>,
            getLocalData: suspend () -> List<T>,
            saveData: suspend (List<T>) -> Unit,
            deleteData: suspend(List<String>) -> Unit,
            authoritativeIds: List<String> = emptyList(),
        ): Result<List<T>> {
            return runCatching {
                val remoteData = getRemoteData()
                val remoteIds = remoteData
                    .asSequence()
                    .map { document -> document.id.trim() }
                    .filter(String::isNotBlank)
                    .toSet()
                val staleIds = authoritativeIds
                    .asSequence()
                    .map(String::trim)
                    .filter(String::isNotBlank)
                    .distinct()
                    .filter { id -> id !in remoteIds }
                    .toList()

                if (staleIds.isNotEmpty()) {
                    deleteData(staleIds)
                }

                if (remoteData.isNotEmpty()) {
                    saveData(remoteData)
                }

                // Room is the cache authority. Re-read it only after all requested changes
                // are applied so callers cannot render a stale, pre-delete object list.
                getLocalData()
            }
        }
    }
}
