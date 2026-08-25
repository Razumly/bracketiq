package com.razumly.mvp.core.data

private data class ProfileDocumentCacheMigrationColumn(
    val name: String,
    val affinity: String,
    val required: Boolean = false,
)

private val PROFILE_DOCUMENT_CACHE_MIGRATION_COLUMNS = listOf(
    ProfileDocumentCacheMigrationColumn("viewerKey", "TEXT", required = true),
    ProfileDocumentCacheMigrationColumn("id", "TEXT", required = true),
    ProfileDocumentCacheMigrationColumn("sortOrder", "INTEGER", required = true),
    ProfileDocumentCacheMigrationColumn("status", "TEXT", required = true),
    ProfileDocumentCacheMigrationColumn("eventId", "TEXT"),
    ProfileDocumentCacheMigrationColumn("eventName", "TEXT"),
    ProfileDocumentCacheMigrationColumn("teamId", "TEXT"),
    ProfileDocumentCacheMigrationColumn("teamName", "TEXT"),
    ProfileDocumentCacheMigrationColumn("organizationId", "TEXT"),
    ProfileDocumentCacheMigrationColumn("organizationName", "TEXT", required = true),
    ProfileDocumentCacheMigrationColumn("templateId", "TEXT", required = true),
    ProfileDocumentCacheMigrationColumn("documentRequirementTitle", "TEXT"),
    ProfileDocumentCacheMigrationColumn("versionSequence", "INTEGER"),
    ProfileDocumentCacheMigrationColumn("title", "TEXT", required = true),
    ProfileDocumentCacheMigrationColumn("type", "TEXT", required = true),
    ProfileDocumentCacheMigrationColumn("provenance", "TEXT"),
    ProfileDocumentCacheMigrationColumn("scopeType", "TEXT"),
    ProfileDocumentCacheMigrationColumn("scopeId", "TEXT"),
    ProfileDocumentCacheMigrationColumn("historicalSigningDate", "TEXT"),
    ProfileDocumentCacheMigrationColumn("requiredSignerType", "TEXT", required = true),
    ProfileDocumentCacheMigrationColumn("requiredSignerLabel", "TEXT", required = true),
    ProfileDocumentCacheMigrationColumn("signerContext", "TEXT", required = true),
    ProfileDocumentCacheMigrationColumn("signerContextLabel", "TEXT", required = true),
    ProfileDocumentCacheMigrationColumn("childUserId", "TEXT"),
    ProfileDocumentCacheMigrationColumn("childEmail", "TEXT"),
    ProfileDocumentCacheMigrationColumn("consentStatus", "TEXT"),
    ProfileDocumentCacheMigrationColumn("requiresChildEmail", "INTEGER", required = true),
    ProfileDocumentCacheMigrationColumn("statusNote", "TEXT"),
    ProfileDocumentCacheMigrationColumn("signedAt", "TEXT"),
    ProfileDocumentCacheMigrationColumn("signedDocumentRecordId", "TEXT"),
    ProfileDocumentCacheMigrationColumn("viewUrl", "TEXT"),
    ProfileDocumentCacheMigrationColumn("content", "TEXT"),
)

internal fun profileDocumentCacheCreateTableSql(includeVersionColumns: Boolean): String {
    val columns = PROFILE_DOCUMENT_CACHE_MIGRATION_COLUMNS
        .filter { includeVersionColumns || it.name !in setOf("documentRequirementTitle", "versionSequence") }
        .joinToString(", ") { column ->
            "`${column.name}` ${column.affinity}${if (column.required) " NOT NULL" else ""}"
        }
    return "CREATE TABLE `profile_document_cache` ($columns, PRIMARY KEY(`viewerKey`, `id`))"
}
