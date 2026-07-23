package com.razumly.mvp.core.presentation

import androidx.compose.ui.unit.sp
import kotlin.test.Test
import kotlin.test.assertEquals

class MVPThemeTypographyTest {
    @Test
    fun givenAndroidTheme_whenReadingTypography_thenCompactSizesAreUsed() {
        assertEquals(50.sp, MVPAppTypography.displayLarge.fontSize)
        assertEquals(28.sp, MVPAppTypography.headlineLarge.fontSize)
        assertEquals(18.sp, MVPAppTypography.titleLarge.fontSize)
        assertEquals(13.sp, MVPAppTypography.titleSmall.fontSize)
        assertEquals(15.sp, MVPAppTypography.bodyLarge.fontSize)
        assertEquals(13.sp, MVPAppTypography.bodyMedium.fontSize)
        assertEquals(10.sp, MVPAppTypography.labelSmall.fontSize)
    }
}
