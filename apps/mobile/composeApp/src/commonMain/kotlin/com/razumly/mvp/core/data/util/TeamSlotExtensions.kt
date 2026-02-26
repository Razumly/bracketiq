package com.razumly.mvp.core.data.util

import com.razumly.mvp.core.data.dataTypes.Team

fun Team.isPlaceholderSlot(): Boolean = captainId.isBlank()

