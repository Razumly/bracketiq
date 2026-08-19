package com.razumly.mvp.core.data

internal val MATCH_GRAPH_OWNERSHIP_MIGRATION_STATEMENTS = listOf(
    "ALTER TABLE `MatchMVP` ADD COLUMN `placementState` TEXT NOT NULL DEFAULT 'UNPLACED'",
    "ALTER TABLE `MatchMVP` ADD COLUMN `phase` TEXT",
    "ALTER TABLE `MatchMVP` ADD COLUMN `sourceDivisionId` TEXT",
    "UPDATE `MatchMVP` SET `placementState` = CASE WHEN `fieldId` IS NOT NULL THEN 'PLACED' ELSE 'UNPLACED' END",
)

internal val MATCH_GRAPH_PHASE_OWNER_MIGRATION_STATEMENTS = listOf(
    "ALTER TABLE `MatchMVP` ADD COLUMN `phaseDivisionId` TEXT",
    """
        UPDATE `MatchMVP`
        SET `phaseDivisionId` = CASE
            WHEN `sourceDivisionId` IS NOT NULL THEN `division`
            ELSE NULL
        END
    """.trimIndent(),
)
