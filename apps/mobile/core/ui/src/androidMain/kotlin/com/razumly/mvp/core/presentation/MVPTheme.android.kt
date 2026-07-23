package com.razumly.mvp.core.presentation

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp

private val MaterialTypography = Typography()

internal actual val MVPAppTypography: Typography = Typography(
    displayLarge = MaterialTypography.displayLarge.compact(50.sp, 56.sp),
    displayMedium = MaterialTypography.displayMedium.compact(40.sp, 46.sp),
    displaySmall = MaterialTypography.displaySmall.compact(32.sp, 38.sp),
    headlineLarge = MaterialTypography.headlineLarge.compact(28.sp, 34.sp),
    headlineMedium = MaterialTypography.headlineMedium.compact(24.sp, 30.sp),
    headlineSmall = MaterialTypography.headlineSmall.compact(21.sp, 27.sp),
    titleLarge = MaterialTypography.titleLarge.compact(18.sp, 23.sp),
    titleMedium = MaterialTypography.titleMedium.compact(15.sp, 21.sp),
    titleSmall = MaterialTypography.titleSmall.compact(13.sp, 18.sp),
    bodyLarge = MaterialTypography.bodyLarge,
    bodyMedium = MaterialTypography.bodyMedium.compact(13.sp, 18.sp),
    bodySmall = MaterialTypography.bodySmall.compact(11.sp, 15.sp),
    labelLarge = MaterialTypography.labelLarge.compact(13.sp, 18.sp),
    labelMedium = MaterialTypography.labelMedium.compact(11.sp, 15.sp),
    labelSmall = MaterialTypography.labelSmall.compact(10.sp, 14.sp),
)

private fun TextStyle.compact(fontSize: TextUnit, lineHeight: TextUnit): TextStyle = copy(
    fontSize = fontSize,
    lineHeight = lineHeight,
)
