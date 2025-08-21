package com.razumly.mvp.core.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.razumly.mvp.core.data.dataTypes.BillingAddress
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class CurrentUserDataSource(private val dataStore: DataStore<Preferences>) {
    private val idKey = stringPreferencesKey("id")
    private val pushToken = stringPreferencesKey("token")
    private val pushTarget = stringPreferencesKey("target")
    private val billingLine1Key = stringPreferencesKey("billing_line1")
    private val billingLine2Key = stringPreferencesKey("billing_line2")
    private val billingCityKey = stringPreferencesKey("billing_city")
    private val billingStateKey = stringPreferencesKey("billing_state")
    private val billingPostalCodeKey = stringPreferencesKey("billing_postalCode")
    private val billingCountryKey = stringPreferencesKey("billing_country")

    suspend fun saveBillingAddress(address: BillingAddress) {
        dataStore.edit { preferences ->
            preferences[billingLine1Key] = address.line1
            preferences[billingLine2Key] = address.line2
            preferences[billingCityKey] = address.city
            preferences[billingStateKey] = address.state
            preferences[billingPostalCodeKey] = address.postalCode
            preferences[billingCountryKey] = address.country
        }
    }

    fun getBillingAddress(): Flow<Result<BillingAddress>> {
        return dataStore.data.map { preferences ->
            val result = runCatching {
                BillingAddress(
                    line1 = preferences[billingLine1Key]!!,
                    line2 = preferences[billingLine2Key]!!,
                    city = preferences[billingCityKey]!!,
                    state = preferences[billingStateKey]!!,
                    postalCode = preferences[billingPostalCodeKey]!!,
                    country = preferences[billingCountryKey]!!
                )
            }
            result.onFailure {
                return@map Result.failure(it)
            }
        }
    }
    suspend fun saveUserId(userId: String) {
        dataStore.edit { dataStore ->
            dataStore[idKey] = userId
        }
    }

    fun getUserId(): Flow<String> {
        return dataStore.data.map {
            it[idKey] ?: ""
        }
    }

    suspend fun savePushToken(token: String) {
        dataStore.edit { dataStore ->
            dataStore[pushToken] = token
        }
    }

    fun getPushToken(): Flow<String> {
        return dataStore.data.map {
            it[pushToken] ?: ""
        }
    }

    suspend fun savePushTarget(target: String) {
        dataStore.edit { dataStore ->
            dataStore[pushTarget] = target
        }
    }

    fun getPushTarget(): Flow<String> {
        return dataStore.data.map {
            it[pushTarget] ?: ""
        }
    }
}