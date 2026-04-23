package com.razumly.mvp.core.data.util

enum class DivisionRatingType {
    AGE,
    SKILL,
}

data class DivisionTypeOption(
    val id: String,
    val name: String,
    val ratingType: DivisionRatingType,
    val sportKey: String,
)

data class DivisionTypeSelections(
    val skillDivisionTypeId: String,
    val skillDivisionTypeName: String,
    val ageDivisionTypeId: String,
    val ageDivisionTypeName: String,
)

private data class DivisionTypeSeed(
    val id: String,
    val name: String,
    val ratingType: DivisionRatingType,
)

private data class SportDivisionTypeCatalog(
    val sportKey: String,
    val aliases: List<String>,
    val options: List<DivisionTypeSeed>,
)

private const val GENERIC_SPORT_KEY = "generic"
private val PREFERRED_AGE_DIVISION_IDS = listOf("18plus", "19plus", "u18", "18u", "u19", "19u")

private val GENERIC_DIVISION_TYPES = listOf(
    DivisionTypeSeed(id = "u10", name = "U10", ratingType = DivisionRatingType.AGE),
    DivisionTypeSeed(id = "u11", name = "U11", ratingType = DivisionRatingType.AGE),
    DivisionTypeSeed(id = "u12", name = "U12", ratingType = DivisionRatingType.AGE),
    DivisionTypeSeed(id = "u13", name = "U13", ratingType = DivisionRatingType.AGE),
    DivisionTypeSeed(id = "u14", name = "U14", ratingType = DivisionRatingType.AGE),
    DivisionTypeSeed(id = "u15", name = "U15", ratingType = DivisionRatingType.AGE),
    DivisionTypeSeed(id = "u16", name = "U16", ratingType = DivisionRatingType.AGE),
    DivisionTypeSeed(id = "u17", name = "U17", ratingType = DivisionRatingType.AGE),
    DivisionTypeSeed(id = "u18", name = "U18", ratingType = DivisionRatingType.AGE),
    DivisionTypeSeed(id = "u19", name = "U19", ratingType = DivisionRatingType.AGE),
    DivisionTypeSeed(id = "18plus", name = "18+", ratingType = DivisionRatingType.AGE),
    DivisionTypeSeed(id = "30plus", name = "30+", ratingType = DivisionRatingType.AGE),
    DivisionTypeSeed(id = "40plus", name = "40+", ratingType = DivisionRatingType.AGE),
    DivisionTypeSeed(id = "beginner", name = "Beginner", ratingType = DivisionRatingType.SKILL),
    DivisionTypeSeed(id = "intermediate", name = "Intermediate", ratingType = DivisionRatingType.SKILL),
    DivisionTypeSeed(id = "advanced", name = "Advanced", ratingType = DivisionRatingType.SKILL),
    DivisionTypeSeed(id = "open", name = "Open", ratingType = DivisionRatingType.SKILL),
)

private val SPORT_DIVISION_TYPES = listOf(
    SportDivisionTypeCatalog(
        sportKey = "soccer",
        aliases = listOf("soccer", "futbol", "football"),
        options = listOf(
            DivisionTypeSeed(id = "u6", name = "U6", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u7", name = "U7", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u8", name = "U8", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u9", name = "U9", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u10", name = "U10", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u11", name = "U11", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u12", name = "U12", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u13", name = "U13", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u14", name = "U14", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u15", name = "U15", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u16", name = "U16", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u17", name = "U17", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u18", name = "U18", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u19", name = "U19", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "18plus", name = "18+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "30plus", name = "30+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "40plus", name = "40+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "rec", name = "Recreational", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "premier", name = "Premier", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "open", name = "Open", ratingType = DivisionRatingType.SKILL),
        ),
    ),
    SportDivisionTypeCatalog(
        sportKey = "volleyball",
        aliases = listOf("volleyball", "vb"),
        options = listOf(
            DivisionTypeSeed(id = "12u", name = "U12", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "13u", name = "U13", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "14u", name = "U14", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "15u", name = "U15", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "16u", name = "U16", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "17u", name = "U17", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "18u", name = "U18", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "18plus", name = "18+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "30plus", name = "30+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "40plus", name = "40+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "open", name = "Open", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "aa", name = "AA", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "a", name = "A", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "bb", name = "BB", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "b", name = "B", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "c", name = "C", ratingType = DivisionRatingType.SKILL),
        ),
    ),
    SportDivisionTypeCatalog(
        sportKey = "hockey",
        aliases = listOf("hockey", "ice hockey"),
        options = listOf(
            DivisionTypeSeed(id = "8u", name = "U8", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "9u", name = "U9", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "10u", name = "U10", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "11u", name = "U11", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "12u", name = "U12", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "13u", name = "U13", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "13o", name = "13O", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "14u", name = "U14", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "15u", name = "U15", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "15o", name = "15O", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "16u", name = "U16", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "17u", name = "U17", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "18u", name = "U18", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "19u", name = "U19", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "18plus", name = "18+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "30plus", name = "30+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "40plus", name = "40+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "aaa", name = "AAA", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "aa", name = "AA", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "a", name = "A", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "b", name = "B", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "c", name = "C", ratingType = DivisionRatingType.SKILL),
        ),
    ),
    SportDivisionTypeCatalog(
        sportKey = "baseball",
        aliases = listOf("baseball"),
        options = listOf(
            DivisionTypeSeed(id = "tee_ball", name = "Tee Ball", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "minor", name = "Minor League", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "major", name = "Major Division", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "intermediate", name = "Intermediate (50/70)", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "junior", name = "Junior League", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "senior", name = "Senior League", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "aaa", name = "AAA", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "aa", name = "AA", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "a", name = "A", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "open", name = "Open", ratingType = DivisionRatingType.SKILL),
        ),
    ),
    SportDivisionTypeCatalog(
        sportKey = "softball",
        aliases = listOf("softball"),
        options = listOf(
            DivisionTypeSeed(id = "10u", name = "U10", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "11u", name = "U11", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "12u", name = "U12", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "13u", name = "U13", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "14u", name = "U14", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "15u", name = "U15", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "16u", name = "U16", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "17u", name = "U17", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "18u", name = "U18", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "18plus", name = "18+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "30plus", name = "30+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "40plus", name = "40+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "a", name = "A", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "aa", name = "AA", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "b", name = "B", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "open", name = "Open", ratingType = DivisionRatingType.SKILL),
        ),
    ),
    SportDivisionTypeCatalog(
        sportKey = "pickleball",
        aliases = listOf("pickleball"),
        options = listOf(
            DivisionTypeSeed(id = "12u", name = "U12", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "13u", name = "U13", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "14u", name = "U14", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "15u", name = "U15", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "17u", name = "U17", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "18u", name = "U18", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "19plus", name = "19+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "30plus", name = "30+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "40plus", name = "40+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "50plus", name = "50+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "55plus", name = "55+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "60plus", name = "60+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "65plus", name = "65+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "70plus", name = "70+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "75plus", name = "75+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "80plus", name = "80+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "3_0", name = "3.0", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "3_5", name = "3.5", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "4_0", name = "4.0", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "4_5", name = "4.5", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "5_0", name = "5.0", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "open", name = "Open", ratingType = DivisionRatingType.SKILL),
        ),
    ),
    SportDivisionTypeCatalog(
        sportKey = "tennis",
        aliases = listOf("tennis"),
        options = listOf(
            DivisionTypeSeed(id = "18plus", name = "18+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "40plus", name = "40+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "55plus", name = "55+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "2_5", name = "2.5", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "3_0", name = "3.0", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "3_5", name = "3.5", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "4_0", name = "4.0", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "4_5", name = "4.5", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "5_0", name = "5.0", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "open", name = "Open", ratingType = DivisionRatingType.SKILL),
        ),
    ),
    SportDivisionTypeCatalog(
        sportKey = "basketball",
        aliases = listOf("basketball", "hoops"),
        options = listOf(
            DivisionTypeSeed(id = "u10", name = "U10", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u11", name = "U11", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u12", name = "U12", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u13", name = "U13", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u14", name = "U14", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u15", name = "U15", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u16", name = "U16", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u17", name = "U17", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u18", name = "U18", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "u19", name = "U19", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "18plus", name = "18+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "30plus", name = "30+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "40plus", name = "40+", ratingType = DivisionRatingType.AGE),
            DivisionTypeSeed(id = "rec", name = "Recreational", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "c", name = "C", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "b", name = "B", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "a", name = "A", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "aa", name = "AA", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "aaa", name = "AAA", ratingType = DivisionRatingType.SKILL),
            DivisionTypeSeed(id = "open", name = "Open", ratingType = DivisionRatingType.SKILL),
        ),
    ),
)

private fun normalizeSportValue(sportInput: String?): String = sportInput
    ?.trim()
    ?.lowercase()
    .orEmpty()

private fun buildCatalogOptions(
    sportKey: String,
    options: List<DivisionTypeSeed>,
): List<DivisionTypeOption> = options.map { option ->
    DivisionTypeOption(
        id = option.id.normalizeDivisionIdentifier(),
        name = option.name,
        ratingType = option.ratingType,
        sportKey = sportKey,
    )
}

private fun uniqueOptions(options: List<DivisionTypeOption>): List<DivisionTypeOption> {
    val seen = linkedSetOf<String>()
    return options.filter { option ->
        seen.add("${option.ratingType}:${option.id}")
    }
}

private fun findCatalogForSport(sportInput: String?): SportDivisionTypeCatalog? {
    val normalizedSport = normalizeSportValue(sportInput)
    if (normalizedSport.isBlank()) {
        return null
    }
    return SPORT_DIVISION_TYPES.firstOrNull { catalog ->
        catalog.aliases.any { alias ->
            normalizedSport.contains(alias) || alias.contains(normalizedSport)
        }
    }
}

fun getDivisionTypeOptionsForSport(sportInput: String?): List<DivisionTypeOption> {
    val catalog = findCatalogForSport(sportInput)
    val baseOptions = if (catalog != null) {
        buildCatalogOptions(catalog.sportKey, catalog.options)
    } else {
        buildCatalogOptions(GENERIC_SPORT_KEY, GENERIC_DIVISION_TYPES)
    }
    return uniqueOptions(baseOptions)
}

fun getDivisionTypeById(
    sportInput: String?,
    divisionTypeId: String,
    ratingType: DivisionRatingType? = null,
): DivisionTypeOption? {
    val normalizedDivisionTypeId = divisionTypeId.normalizeDivisionIdentifier()
    if (normalizedDivisionTypeId.isBlank()) {
        return null
    }
    return getDivisionTypeOptionsForSport(sportInput).firstOrNull { option ->
        option.id == normalizedDivisionTypeId &&
            (ratingType == null || option.ratingType == ratingType)
    }
}

fun getDefaultDivisionTypeSelectionsForSport(sportInput: String?): DivisionTypeSelections {
    val options = getDivisionTypeOptionsForSport(sportInput)
    val fallbackSkill = options.firstOrNull { option ->
        option.ratingType == DivisionRatingType.SKILL && option.id == "open"
    } ?: options.firstOrNull { option ->
        option.ratingType == DivisionRatingType.SKILL
    } ?: DivisionTypeOption(
        id = DEFAULT_DIVISION,
        name = "Open",
        ratingType = DivisionRatingType.SKILL,
        sportKey = GENERIC_SPORT_KEY,
    )

    val fallbackAge = PREFERRED_AGE_DIVISION_IDS.firstNotNullOfOrNull { preferredAgeId ->
        options.firstOrNull { option ->
            option.ratingType == DivisionRatingType.AGE && option.id == preferredAgeId
        }
    } ?: options.firstOrNull { option ->
        option.ratingType == DivisionRatingType.AGE
    } ?: DivisionTypeOption(
        id = DEFAULT_AGE_DIVISION,
        name = "18+",
        ratingType = DivisionRatingType.AGE,
        sportKey = GENERIC_SPORT_KEY,
    )

    return DivisionTypeSelections(
        skillDivisionTypeId = fallbackSkill.id,
        skillDivisionTypeName = fallbackSkill.name,
        ageDivisionTypeId = fallbackAge.id,
        ageDivisionTypeName = fallbackAge.name,
    )
}
