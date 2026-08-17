package com.razumly.mvp.core.data.dataTypes

data class OrganizationTemplateDocument(
    val id: String,
    val title: String,
    val type: String = "PDF",
    val requiredSignerType: String = "PARTICIPANT",
)
