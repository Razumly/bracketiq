package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

interface PlayerInteractionComponent {
    val errorState: StateFlow<ErrorMessage?>
    fun setLoadingHandler(handler: LoadingHandler)
    fun sendFriendRequest(user: UserData)
    fun followUser(user: UserData)
    fun unfollowUser(user: UserData)
    fun blockUser(user: UserData, leaveSharedChats: Boolean = true)
    fun unblockUser(user: UserData)
}

class DefaultPlayerInteractionComponent(
    componentContext: ComponentContext,
    private val userRepository: IUserRepository,
) : PlayerInteractionComponent, ComponentContext by componentContext {

    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())
    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState = _errorState

    private var loadingHandler: LoadingHandler? = null

    override fun setLoadingHandler(handler: LoadingHandler) {
        loadingHandler = handler
    }

    override fun sendFriendRequest(user: UserData) {
        launchPlayerAction("Sending Friend Request ...") {
            userRepository.sendFriendRequest(user)
        }
    }

    override fun followUser(user: UserData) {
        launchPlayerAction("Following User ...") {
            userRepository.followUser(user.id)
        }
    }

    override fun unfollowUser(user: UserData) {
        launchPlayerAction("Unfollowing User ...") {
            userRepository.unfollowUser(user.id)
        }
    }

    override fun blockUser(user: UserData, leaveSharedChats: Boolean) {
        launchPlayerAction("Blocking User ...") {
            userRepository.blockUser(user.id, leaveSharedChats)
        }
    }

    override fun unblockUser(user: UserData) {
        launchPlayerAction("Unblocking User ...") {
            userRepository.unblockUser(user.id)
        }
    }

    private fun launchPlayerAction(
        loadingMessage: String,
        action: suspend () -> Result<*>,
    ) {
        scope.launch {
            val actionLoadingHandler = loadingHandler
            try {
                actionLoadingHandler?.showLoading(loadingMessage)
                action().onFailure { error ->
                    if (error is CancellationException) throw error
                    _errorState.value = ErrorMessage(error.userMessage())
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                _errorState.value = ErrorMessage(error.userMessage())
            } finally {
                actionLoadingHandler?.hideLoading()
            }
        }
    }
}
