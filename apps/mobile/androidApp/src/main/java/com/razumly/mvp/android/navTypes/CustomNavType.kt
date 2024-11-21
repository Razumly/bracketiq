package com.razumly.mvp.android.navTypes

import android.net.Uri
import android.os.Bundle
import androidx.navigation.NavType
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Tournament
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

object CustomNavType {
    val EventType = object : NavType<EventAbs>(
        isNullableAllowed = false
    ) {
        override fun get(bundle: Bundle, key: String): EventAbs? {
            return Json.decodeFromString(bundle.getString(key)!!)
        }

        override fun parseValue(value: String): EventAbs {
            return Json.decodeFromString(Uri.decode(value))
        }

        override fun serializeAsValue(value: EventAbs): String {
            return Uri.encode(Json.encodeToString(value))
        }

        override fun put(bundle: Bundle, key: String, value: EventAbs) {
            bundle.putString(key, Json.encodeToString(value))
        }
    }

    val MatchMVPType = object : NavType<MatchMVP>(
        isNullableAllowed = false
    ) {
        override fun get(bundle: Bundle, key: String): MatchMVP? {
            return Json.decodeFromString(bundle.getString(key)!!)
        }

        override fun parseValue(value: String): MatchMVP {
            return Json.decodeFromString(Uri.decode(value))
        }

        override fun serializeAsValue(value: MatchMVP): String {
            return Uri.encode(Json.encodeToString(value))
        }

        override fun put(bundle: Bundle, key: String, value: MatchMVP) {
            bundle.putString(key, Json.encodeToString(value))
        }
    }

    val TournamentType = object : NavType<Tournament>(
        isNullableAllowed = false
    ) {
        override fun get(bundle: Bundle, key: String): Tournament? {
            return Json.decodeFromString(bundle.getString(key)!!)
        }

        override fun parseValue(value: String): Tournament {
            return Json.decodeFromString(Uri.decode(value))
        }

        override fun serializeAsValue(value: Tournament): String {
            return Uri.encode(Json.encodeToString(value))
        }

        override fun put(bundle: Bundle, key: String, value: Tournament) {
            bundle.putString(key, Json.encodeToString(value))
        }
    }
}