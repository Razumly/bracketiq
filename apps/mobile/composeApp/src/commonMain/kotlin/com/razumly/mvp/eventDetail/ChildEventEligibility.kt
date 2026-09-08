@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

internal fun childAgeAtEvent(child: JoinChildOption, event: Event): Int? {
    val birthdate = parseChildBirthdate(child.dateOfBirth) ?: return null
    val eventDate = event.start.toLocalDateTime(TimeZone.UTC).date
    return ageOnDate(birthdate, eventDate).takeIf { it >= 0 }
}

internal fun isChildEligibleForEvent(child: JoinChildOption, event: Event, divisionId: String?): Boolean {
    if (event.teamSignup) return false
    val birthdate = parseChildBirthdate(child.dateOfBirth) ?: return false
    val age = childAgeAtEvent(child, event) ?: return false
    val minimum = event.minAge
    val maximum = event.maxAge
    if (minimum != null && age < minimum) return false
    if (maximum != null && age > maximum) return false
    val division = if (divisionId.isNullOrBlank()) {
        null
    } else {
        event.divisionDetails.firstOrNull { it.id == divisionId } ?: return false
    }
    val typeId = division?.divisionTypeId.orEmpty().lowercase()
    val ageToken = Regex("(?:^|_)age_([a-z0-9]+)(?:_|$)").find(typeId)?.groupValues?.get(1) ?: typeId
    val cutoff = divisionAgeCutoff(event.start.toLocalDateTime(TimeZone.UTC).year, event.sportIds.firstOrNull())
    val cutoffAge = ageOnDate(birthdate, cutoff)
    Regex("^(?:u(\\d+)|(\\d+)u)$").matchEntire(ageToken)?.let {
        val maximum = it.groupValues.drop(1).first(String::isNotEmpty).toInt()
        return cutoffAge in 0..maximum
    }
    Regex("^(\\d+)plus$").matchEntire(ageToken)?.let { return cutoffAge >= it.groupValues[1].toInt() }
    Regex("^(\\d+)o$").matchEntire(ageToken)?.let { return cutoffAge == it.groupValues[1].toInt() }
    return true
}

private fun parseChildBirthdate(value: String?): LocalDate? =
    value?.let { runCatching { LocalDate.parse(it.substringBefore('T')) }.getOrNull() }

private fun ageOnDate(birthdate: LocalDate, reference: LocalDate): Int =
    reference.year - birthdate.year - if (
        reference.monthNumber < birthdate.monthNumber ||
        (reference.monthNumber == birthdate.monthNumber && reference.dayOfMonth < birthdate.dayOfMonth)
    ) 1 else 0

// Match the site's divisionTypes.ts cutoff catalog. The server rechecks eligibility on save.
private fun divisionAgeCutoff(year: Int, sportId: String?): LocalDate {
    val sport = sportId.orEmpty().lowercase().trim()
    fun matches(vararg aliases: String) = sport.isNotEmpty() && aliases.any { sport.contains(it) || it.contains(sport) }
    return when {
        matches("soccer", "futbol", "futsal") -> LocalDate(year, 8, 1)
        matches("volleyball", "vb") -> LocalDate(year, 7, 1)
        matches("hockey", "ice hockey") -> LocalDate(year, 12, 31)
        matches("baseball") -> LocalDate(year, 8, 31)
        matches("softball") -> LocalDate(year - 1, 12, 31)
        matches("ultimate", "ultimate frisbee", "disc") -> LocalDate(year, 6, 1)
        matches("pickleball", "tennis") -> LocalDate(year, 12, 31)
        matches("basketball", "hoops") -> LocalDate(year, 8, 31)
        else -> LocalDate(year, 12, 31)
    }
}
