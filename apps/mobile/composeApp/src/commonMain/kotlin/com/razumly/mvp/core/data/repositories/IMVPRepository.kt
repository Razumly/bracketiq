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

        suspend fun <T : MVPDocument> multiResponse(
            getRemoteData: suspend () -> List<T>,
            getLocalData: suspend () -> List<T>,
            saveData: suspend (List<T>) -> Unit,
            deleteData: suspend(List<String>) -> Unit,
        ): Result<List<T>> {
            return runCatching {
                // Get remote data
                val remoteData = getRemoteData()
                val localData = getLocalData()
                deleteData((localData.map { it.id }.toSet() - remoteData.map { it.id }
                    .toSet()).toList())

                // Save new/updated items
                if (remoteData.isNotEmpty()) {
                    saveData(remoteData)
                    remoteData
                } else {
                    localData
                }
            }
        }
    }
}