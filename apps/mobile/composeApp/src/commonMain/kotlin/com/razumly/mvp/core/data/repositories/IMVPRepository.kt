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
        ): Result<List<T>> {
            return runCatching {
                // Get remote data
                val remoteData = getRemoteData()

                // Save new/updated items
                if (remoteData.isNotEmpty()) {
                    val dataToSave = remoteData + getLocalData()
                    saveData(dataToSave)
                    dataToSave
                } else {
                    throw Exception("Remote data came back empty")
                }
            }
        }
    }
}