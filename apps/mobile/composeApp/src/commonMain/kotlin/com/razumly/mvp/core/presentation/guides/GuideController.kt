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

data class GuideTarget(
    val bounds: Rect,
    val highlightShape: GuideHighlightShape,
)

@Stable
class GuideController(
    private val onGuideCompleted: (String) -> Unit,
) {
    private val targets = mutableStateMapOf<String, GuideTarget>()
    private var accountId: String? = null

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

    val activeTarget: GuideTarget?
        get() = activeStep?.targetId?.let { targetId -> targets[targetId] }

    val hasActiveGuide: Boolean
        get() = activeGuide != null

    fun updateAccount(rawAccountId: String?) {
        val normalizedAccountId = rawAccountId?.trim()?.takeIf(String::isNotBlank)
        if (accountId == normalizedAccountId) return

        accountId = normalizedAccountId
        completedGuideIds = emptySet()
        completedGuideIdsLoaded = false
        clearActiveGuide()
    }

    fun updateCompletedGuideIds(
        accountId: String?,
        ids: Set<String>,
        loaded: Boolean,
    ) {
        val normalizedAccountId = accountId?.trim()?.takeIf(String::isNotBlank)
        if (normalizedAccountId != this.accountId) return

        completedGuideIds = ids
        completedGuideIdsLoaded = loaded
        val activeGuideId = activeGuide?.id
        if (activeGuideId != null && activeGuideId in ids) {
            clearActiveGuide()
        }
    }

    fun registerTarget(
        targetId: String,
        bounds: Rect,
        highlightShape: GuideHighlightShape,
    ) {
        targets[targetId] = GuideTarget(
            bounds = bounds,
            highlightShape = highlightShape,
        )
    }

    fun removeTarget(targetId: String) {
        targets.remove(targetId)
    }

    fun hasTarget(targetId: String): Boolean = targets.containsKey(targetId)

    fun isGuideCompleted(guideId: String): Boolean = guideId in completedGuideIds

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

fun Modifier.guideTarget(
    targetId: String,
    highlightShape: GuideHighlightShape = GuideHighlightShape.RoundedRect(),
): Modifier = composed {
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
            guideController.registerTarget(
                targetId = targetId,
                bounds = coordinates.boundsInWindow(),
                highlightShape = highlightShape,
            )
        }
    }
}
