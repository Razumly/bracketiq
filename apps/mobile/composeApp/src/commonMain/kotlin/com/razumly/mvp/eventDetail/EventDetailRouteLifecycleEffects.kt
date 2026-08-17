package com.razumly.mvp.eventDetail

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.PopupHandler
import kotlinx.coroutines.flow.Flow

@Composable
internal fun EventDetailRouteLifecycleEffects(
    eventErrors: Flow<ErrorMessage?>,
    playerErrors: Flow<ErrorMessage?>,
    loadingHandler: LoadingHandler,
    popupHandler: PopupHandler,
    setEventLoadingHandler: (LoadingHandler) -> Unit,
    setPlayerLoadingHandler: (LoadingHandler) -> Unit,
    clearEventError: () -> Unit,
    showDetails: Boolean,
    isEditing: Boolean,
    showMap: Boolean,
    closeJoinOptions: () -> Unit,
    resetStickyDock: () -> Unit,
    clearMapSelection: () -> Unit,
) {
    LaunchedEffect(Unit) {
        setEventLoadingHandler(loadingHandler)
        eventErrors.collect { error ->
            if (error != null) {
                popupHandler.showPopup(error)
                clearEventError()
            }
        }
    }

    LaunchedEffect(playerErrors, loadingHandler, popupHandler) {
        setPlayerLoadingHandler(loadingHandler)
        playerErrors.collect { error ->
            if (error != null) popupHandler.showPopup(error)
        }
    }

    LaunchedEffect(showDetails, isEditing, showMap) {
        if (showDetails || isEditing || showMap) {
            closeJoinOptions()
            resetStickyDock()
        }
    }

    LaunchedEffect(isEditing) {
        if (!isEditing) clearMapSelection()
    }

    LaunchedEffect(showMap) {
        if (!showMap) clearMapSelection()
    }
}
