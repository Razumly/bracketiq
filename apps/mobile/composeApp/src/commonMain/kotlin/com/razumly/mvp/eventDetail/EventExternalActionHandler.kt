package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.presentation.util.ShareServiceProvider
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.UrlHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

internal class EventExternalActionHandler(
    private val scope: CoroutineScope,
    private val eventRepository: IEventRepository,
    private val billingRepository: IBillingRepository,
    private val apiClient: MvpApiClient?,
    private val loadingHandler: () -> LoadingHandler,
    private val urlHandler: () -> UrlHandler?,
    private val selectedEvent: () -> Event,
    private val navigateBack: () -> Unit,
    private val setMessage: (String) -> Unit,
) {
    private val shareServiceProvider = ShareServiceProvider()

    fun deleteEvent() {
        scope.launch {
            val currentEvent = selectedEvent()
            val deletePlan = eventDeletePlan(currentEvent)
            var deleted = false
            val loadingOperation = loadingHandler().newOperation()
            loadingOperation.showLoading(deletePlan.loadingMessage)
            try {
                if (!deletePlan.shouldRefund) {
                    eventRepository.deleteEvent(currentEvent.id)
                        .onSuccess { deleted = true }
                        .onFailure { setMessage(it.userMessage()) }
                } else {
                    billingRepository.deleteAndRefundEvent(currentEvent)
                        .onSuccess { deleted = true }
                        .onFailure { setMessage(it.userMessage()) }
                }
                if (deleted) {
                    navigateBack()
                }
            } finally {
                loadingOperation.hideLoading()
            }
        }
    }

    fun reportEvent(notes: String?) {
        val currentEvent = selectedEvent()
        scope.launch {
            eventRepository.reportEvent(currentEvent.id, notes)
                .onSuccess {
                    setMessage("Event reported. It will be hidden from your searches.")
                    navigateBack()
                }
                .onFailure { setMessage(it.userMessage("Failed to report event.")) }
        }
    }

    fun shareEvent() {
        val payload = eventSharePayload(selectedEvent())
        shareServiceProvider.getShareService().share(payload.title, payload.url)
    }

    fun shareEventQrCode() {
        val payload = eventQrCodeSharePayload(selectedEvent())
        val client = apiClient ?: run {
            setMessage("Failed to share QR code.")
            return
        }
        scope.launch {
            runCatching {
                client.getBytes(payload.path)
            }.onSuccess { imageBytes ->
                shareServiceProvider.getShareService().shareImage(
                    title = payload.title,
                    imageBytes = imageBytes,
                    fileName = payload.fileName,
                    mimeType = payload.mimeType,
                )
            }.onFailure { throwable ->
                setMessage(throwable.userMessage("Failed to share QR code."))
            }
        }
    }

    fun openEventDirections() {
        val directionsPlan = eventDirectionsPlan(selectedEvent())
        if (directionsPlan is EventDirectionsPlan.Unavailable) {
            setMessage(directionsPlan.message)
            return
        }
        val directionsUrls = (directionsPlan as EventDirectionsPlan.OpenUrl).let { plan ->
            listOf(plan.url) + plan.fallbackUrls
        }

        scope.launch {
            val handler = urlHandler()
            if (handler == null) {
                setMessage("Unable to open directions.")
                return@launch
            }

            var lastFailure: Throwable? = null
            for (directionsUrl in directionsUrls) {
                val result = handler.openDirectionsUrl(directionsUrl)
                if (result.isSuccess) {
                    return@launch
                }
                lastFailure = result.exceptionOrNull()
            }

            setMessage(
                lastFailure?.userMessage("Unable to open directions.")
                    ?: "Unable to open directions."
            )
        }
    }
}
