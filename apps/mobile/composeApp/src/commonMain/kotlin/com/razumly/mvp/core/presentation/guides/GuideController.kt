package com.razumly.mvp.core.presentation.guides

import androidx.compose.runtime.Stable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.runtime.DisposableEffect

val LocalGuideController = compositionLocalOf<GuideController?> { null }

@Stable
class GuideController(
    private val onGuideCompleted: (String) -> Unit,
) {
    private val targetBounds = mutableStateMapOf<String, Rect>()

    var completedGuideIds by mutableStateOf<Set<String>>(emptySet())
        private set

    var completedGuideIdsLoaded by mutableStateOf(false)
        private set

    var activeGuide by mutableStateOf<AppGuide?>(null)
        private set

    var activeStepIndex by mutableIntStateOf(0)
        private set

    val activeStep: AppGuideStep?
        get() = activeGuide?.steps?.getOrNull(activeStepIndex)

    val activeTargetBounds: Rect?
        get() = activeStep?.targetId?.let { targetId -> targetBounds[targetId] }

    fun updateCompletedGuideIds(
        ids: Set<String>,
        loaded: Boolean,
    ) {
        completedGuideIds = ids
        completedGuideIdsLoaded = loaded
        val activeGuideId = activeGuide?.id
        if (activeGuideId != null && activeGuideId in ids) {
            clearActiveGuide()
        }
    }

    fun registerTarget(targetId: String, bounds: Rect) {
        targetBounds[targetId] = bounds
    }

    fun removeTarget(targetId: String) {
        targetBounds.remove(targetId)
    }

    fun hasTarget(targetId: String): Boolean = targetBounds.containsKey(targetId)

    fun maybeStartGuide(
        guide: AppGuide,
        requiredTargetIds: Set<String> = emptySet(),
    ) {
        if (!completedGuideIdsLoaded) return
        if (activeGuide != null || guide.id in completedGuideIds) return
        if (!requiredTargetIds.all(::hasTarget)) return

        val availableSteps = guide.steps.filter { step -> hasTarget(step.targetId) }
        if (availableSteps.isEmpty()) return

        activeGuide = guide.copy(steps = availableSteps)
        activeStepIndex = 0
    }

    fun next() {
        val guide = activeGuide ?: return
        if (activeStepIndex < guide.steps.lastIndex) {
            activeStepIndex += 1
        } else {
            finishActiveGuide()
        }
    }

    fun previous() {
        if (activeStepIndex > 0) {
            activeStepIndex -= 1
        }
    }

    fun dismiss() {
        finishActiveGuide()
    }

    fun cancel() {
        clearActiveGuide()
    }

    private fun finishActiveGuide() {
        val guideId = activeGuide?.id ?: return
        onGuideCompleted(guideId)
        clearActiveGuide()
    }

    private fun clearActiveGuide() {
        activeGuide = null
        activeStepIndex = 0
    }
}

fun Modifier.guideTarget(targetId: String): Modifier = composed {
    val guideController = LocalGuideController.current
    if (guideController == null) {
        this
    } else {
        DisposableEffect(guideController, targetId) {
            onDispose {
                guideController.removeTarget(targetId)
            }
        }

        this.onGloballyPositioned { coordinates ->
            guideController.registerTarget(targetId, coordinates.boundsInWindow())
        }
    }
}
