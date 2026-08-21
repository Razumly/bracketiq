package com.razumly.mvp.core.data

internal val EVENT_TIME_SLOT_CACHE_MIGRATION_STATEMENTS = listOf(
    """
        CREATE TABLE IF NOT EXISTS `event_time_slot_cache` (
            `eventId` TEXT NOT NULL,
            `slotId` TEXT NOT NULL,
            `position` INTEGER NOT NULL,
            `dayOfWeek` INTEGER,
            `daysOfWeek` TEXT,
            `divisions` TEXT,
            `startTimeMinutes` INTEGER,
            `endTimeMinutes` INTEGER,
            `startDate` INTEGER NOT NULL,
            `timeZone` TEXT NOT NULL,
            `repeating` INTEGER NOT NULL,
            `endDate` INTEGER,
            `scheduledFieldId` TEXT,
            `scheduledFieldIds` TEXT,
            `price` INTEGER,
            `requiredTemplateIds` TEXT NOT NULL,
            `hostRequiredTemplateIds` TEXT NOT NULL,
            `sourceType` TEXT,
            `rentalBookingId` TEXT,
            `rentalBookingItemId` TEXT,
            `rentalLocked` INTEGER,
            PRIMARY KEY(`eventId`, `slotId`)
        )
    """.trimIndent(),
    "CREATE INDEX IF NOT EXISTS `index_event_time_slot_cache_eventId` ON `event_time_slot_cache` (`eventId`)",
)
