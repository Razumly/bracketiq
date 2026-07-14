package com.razumly.mvp.wear

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.razumly.mvp.wear.ui.MvpWearApp

class MainActivity : ComponentActivity() {
    private val viewModel: MvpWearViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applyDemoRoute(intent)
        setContent {
            val state = viewModel.state.collectAsStateWithLifecycle().value
            BackHandler(
                enabled = !state.isLoading && state.route != WearRoute.LOGIN && state.route != WearRoute.MATCHES,
            ) {
                viewModel.back()
            }
            MvpWearApp(
                state = state,
                actions = MvpWearActions(
                    onEmailChange = viewModel::updateEmail,
                    onPasswordChange = viewModel::updatePassword,
                    onSignIn = viewModel::signIn,
                    onLogout = viewModel::logout,
                    onRefresh = viewModel::refresh,
                    onMatchSelected = viewModel::selectMatch,
                    onBack = viewModel::back,
                    onCheckIn = viewModel::checkIn,
                    onStartTimer = viewModel::startTimer,
                    onOpenTimer = viewModel::openTimer,
                    onTimerTapped = viewModel::showTeamPicker,
                    onResetTimer = viewModel::resetTimer,
                    onEndSegment = viewModel::endSegment,
                    onStartNextSegment = viewModel::startNextSegment,
                    onEndMatch = viewModel::endMatch,
                    onShowActionMenu = viewModel::showActionMenu,
                    onShowIncidentList = viewModel::showIncidentList,
                    onTeamSelected = viewModel::selectTeam,
                    onOpenIncident = viewModel::openIncidentEditor,
                    onEditIncidentField = viewModel::editIncidentField,
                    onIncidentSelected = viewModel::selectIncident,
                    onPlayerSelected = viewModel::selectPlayer,
                    onMinuteAdjusted = viewModel::adjustMinute,
                    onTimeDone = viewModel::returnToIncidentEditor,
                    onFinishIncident = viewModel::finishIncident,
                    onRequestDeleteIncident = viewModel::requestDeleteIncident,
                    onDeleteIncident = viewModel::deleteIncident,
                    onCancelIncident = viewModel::cancelIncident,
                ),
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        applyDemoRoute(intent)
    }

    private fun applyDemoRoute(intent: Intent?) {
        if (!BuildConfig.DEBUG) return
        val routeName = intent?.getStringExtra(EXTRA_DEMO_ROUTE) ?: return
        runCatching {
            Class.forName("com.razumly.mvp.wear.debug.WearScreenshotDemo")
                .getMethod("apply", MvpWearViewModel::class.java, String::class.java)
                .invoke(null, viewModel, routeName)
        }
    }

    companion object {
        const val EXTRA_DEMO_ROUTE = "mvp_wear_demo"
    }
}

data class MvpWearActions(
    val onEmailChange: (String) -> Unit,
    val onPasswordChange: (String) -> Unit,
    val onSignIn: () -> Unit,
    val onLogout: () -> Unit,
    val onRefresh: () -> Unit,
    val onMatchSelected: (String) -> Unit,
    val onBack: () -> Unit,
    val onCheckIn: () -> Unit,
    val onStartTimer: () -> Unit,
    val onOpenTimer: () -> Unit,
    val onTimerTapped: () -> Unit,
    val onResetTimer: () -> Unit,
    val onEndSegment: () -> Unit,
    val onStartNextSegment: () -> Unit,
    val onEndMatch: () -> Unit,
    val onShowActionMenu: () -> Unit,
    val onShowIncidentList: () -> Unit,
    val onTeamSelected: (String) -> Unit,
    val onOpenIncident: (String) -> Unit,
    val onEditIncidentField: (WearIncidentField) -> Unit,
    val onIncidentSelected: (String) -> Unit,
    val onPlayerSelected: (String?) -> Unit,
    val onMinuteAdjusted: (Int) -> Unit,
    val onTimeDone: () -> Unit,
    val onFinishIncident: () -> Unit,
    val onRequestDeleteIncident: () -> Unit,
    val onDeleteIncident: () -> Unit,
    val onCancelIncident: () -> Unit,
)
