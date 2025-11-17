package com.razumly.mvp.core.util

object DbConstants {
    const val APPWRITE_ENDPOINT = "https://sfo.cloud.appwrite.io/v1"
    const val DATABASE_NAME = "mvp"
    const val EVENT_TABLE = "events"
    const val TIME_SLOTS_TABLE = "timeSlots"
    const val ORGANIZATIONS_TABLE = "organizations"
    const val SPORTS_TABLE = "sports"
    const val LEAGUE_SCORING_CONFIGS_TABLE = "leagueScoringConfigs"
    const val CHAT_GROUP_TABLE = "chatGroup"
    const val MESSAGES_TABLE = "messages"
    const val USER_DATA_TABLE = "userData"
    const val VOLLEYBALL_TEAMS_TABLE = "volleyballTeams"
    const val MATCHES_TABLE = "matches"
    const val FIELDS_TABLE = "fields"
    const val REFUNDS_TABLE = "refundRequests"
    const val ADDRESSES_TABLE = "addresses"
    const val EVENT_ID_ATTRIBUTE = "eventId"
    const val EVENT_TYPE_ATTRIBUTE = "eventType"
    const val TEAMS_PLAYERS_ATTRIBUTE = "playerIds"
    const val TEAMS_PENDING_ATTRIBUTE = "pending"
    const val EVENTS_ATTRIBUTE = "eventIds"
    const val COORDINATES_ATTRIBUTE = "coordinates"
    const val EVENT_MANAGER_FUNCTION = "eventManager"
    const val BILLING_FUNCTION = "mvpBilling"
    const val ERROR_TAG = "Database"
    const val MATCHES_CHANNEL = "databases.$DATABASE_NAME.tables.$MATCHES_TABLE.rows"
    const val CHAT_GROUPS_CHANNEL = "databases.$DATABASE_NAME.tables.$CHAT_GROUP_TABLE.rows"
    const val MESSAGES_CHANNEL = "databases.$DATABASE_NAME.tables.$MESSAGES_TABLE.rows"
    const val USER_CHANNEL = "databases.$DATABASE_NAME.tables.$USER_DATA_TABLE.rows"
}

object UIConstants {
    const val PROFILE_PICTURE_HEIGHT = 56
}
