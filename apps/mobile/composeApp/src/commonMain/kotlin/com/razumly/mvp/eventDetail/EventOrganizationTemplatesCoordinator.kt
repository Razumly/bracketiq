package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

internal class EventOrganizationTemplatesCoordinator {
    private val _templates = MutableStateFlow<List<OrganizationTemplateDocument>>(emptyList())
    val templates = _templates.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error = _error.asStateFlow()

    fun clear() {
        _templates.value = emptyList()
        _error.value = null
        _loading.value = false
    }

    fun beginLoad() {
        _loading.value = true
        _error.value = null
    }

    fun applyLoadSuccess(templates: List<OrganizationTemplateDocument>) {
        _templates.value = templates
    }

    fun applyLoadFailure(message: String) {
        _templates.value = emptyList()
        _error.value = message
    }

    fun finishLoad() {
        _loading.value = false
    }
}
