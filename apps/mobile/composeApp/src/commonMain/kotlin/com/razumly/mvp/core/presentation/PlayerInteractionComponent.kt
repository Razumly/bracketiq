package com.razumly.mvp.core.presentation

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.chat.data.IChatGroupRepository
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
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
}

class DefaultPlayerInteractionComponent(
    componentContext: ComponentContext,
    private val userRepository: IUserRepository,
    private val chatRepository: IChatGroupRepository
) : PlayerInteractionComponent, ComponentContext by componentContext {

    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())
    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState = _errorState

    private lateinit var _loadingHandler: LoadingHandler

    override fun setLoadingHandler(handler: LoadingHandler) {
        _loadingHandler = handler
    }

    override fun sendFriendRequest(user: UserData) {
        scope.launch {
            _loadingHandler.showLoading("Sending Friend Request ...")
            userRepository.sendFriendRequest(user).onFailure {
               _errorState.value = ErrorMessage(it.message ?: "")
            }
            _loadingHandler.hideLoading()
        }
    }

    override fun followUser(user: UserData) {
        scope.launch {
            _loadingHandler.showLoading("Following User ...")
            userRepository.followUser(user.id).onFailure {
                _errorState.value = ErrorMessage(it.message ?: "")
            }
            _loadingHandler.hideLoading()
        }
    }

    override fun unfollowUser(user: UserData) {
        scope.launch {
            _loadingHandler.showLoading("Unfollowing User ...")
            userRepository.unfollowUser(user.id).onFailure {
                _errorState.value = ErrorMessage(it.message ?: "")
            }
            _loadingHandler.hideLoading()
        }
    }
}
