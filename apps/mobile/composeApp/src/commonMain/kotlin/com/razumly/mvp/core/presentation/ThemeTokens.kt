package com.razumly.mvp.core.presentation

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

val LightAppColorScheme = lightColorScheme(
    background = Color(0xFFFFFFFF),
    surface = Color(0xFFF8FAFC),
    surfaceDim = Color(0xFFE7EDF3),
    surfaceBright = Color(0xFFFFFFFF),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFE7EDF3),
    surfaceContainer = Color(0xFFF2F5F8),
    surfaceContainerHigh = Color(0xFFEFF4F8),
    surfaceContainerHighest = Color(0xFFE7EDF3),
    surfaceVariant = Color(0xFFF2F5F8),
    onBackground = Color(0xFF1E2633),
    onSurface = Color(0xFF1E2633),
    onSurfaceVariant = Color(0xFF5E6B78),
    primary = Color(0xFF19497A),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFDCEAF7),
    onPrimaryContainer = Color(0xFF1E2633),
    secondary = Color(0xFFBFD2E6),
    onSecondary = Color(0xFF1E2633),
    secondaryContainer = Color(0xFFEEF5FB),
    onSecondaryContainer = Color(0xFF1E2633),
    tertiary = Color(0xFFB6A676),
    onTertiary = Color(0xFF1E2633),
    tertiaryContainer = Color(0xFFEFE7D1),
    onTertiaryContainer = Color(0xFF5B4B1F),
    outline = Color(0xFFD3DCE6),
    outlineVariant = Color(0xFFE7EDF3),
    scrim = Color(0x990E1A26),
)

val DarkAppColorScheme = darkColorScheme(
    background = Color(0xFF111A24),
    surface = Color(0xFF172131),
    surfaceDim = Color(0xFF0E1520),
    surfaceBright = Color(0xFF223041),
    surfaceContainerLowest = Color(0xFF0D141D),
    surfaceContainerLow = Color(0xFF1C2738),
    surfaceContainer = Color(0xFF223041),
    surfaceContainerHigh = Color(0xFF253648),
    surfaceContainerHighest = Color(0xFF2C394B),
    surfaceVariant = Color(0xFF223041),
    onBackground = Color(0xFFEDF3FA),
    onSurface = Color(0xFFEDF3FA),
    onSurfaceVariant = Color(0xFFAEB9C7),
    primary = Color(0xFF8EB8DE),
    onPrimary = Color(0xFF10263B),
    primaryContainer = Color(0xFF294867),
    onPrimaryContainer = Color(0xFFEDF3FA),
    secondary = Color(0xFF94AEC8),
    onSecondary = Color(0xFF10263B),
    secondaryContainer = Color(0xFF213244),
    onSecondaryContainer = Color(0xFFEDF3FA),
    tertiary = Color(0xFFD4CDA6),
    onTertiary = Color(0xFF31290E),
    tertiaryContainer = Color(0xFF564F37),
    onTertiaryContainer = Color(0xFFF3EDD0),
    outline = Color(0xFF344255),
    outlineVariant = Color(0xFF2C394B),
    scrim = Color(0xCC000000),
)

@Immutable
data class AvatarFallbackColors(
    val background: Color,
    val content: Color,
)

@Immutable
data class AppExtendedColors(
    val chatIncomingBubble: Color,
    val chatOutgoingBubble: Color,
    val premiumAccent: Color,
    val liveAccent: Color,
    val placeholderReadable: Color,
    val disabledReadable: Color,
    val sharedScrim: Color,
    val avatarFallbackPalette: List<AvatarFallbackColors>,
)

val LightAppExtendedColors = AppExtendedColors(
    chatIncomingBubble = Color(0xFFF2F5F8),
    chatOutgoingBubble = Color(0xFFDCEAF7),
    premiumAccent = Color(0xFFB6A676),
    liveAccent = Color(0xFFDE7837),
    placeholderReadable = Color(0xFF6B7785),
    disabledReadable = Color(0xFF5E6B78),
    sharedScrim = Color(0x990E1A26),
    avatarFallbackPalette = listOf(
        AvatarFallbackColors(background = Color(0xFFDCEAF7), content = Color(0xFF19497A)),
        AvatarFallbackColors(background = Color(0xFFF2F5F8), content = Color(0xFF1E2633)),
        AvatarFallbackColors(background = Color(0xFFEFE7D1), content = Color(0xFF5B4B1F)),
        AvatarFallbackColors(background = Color(0xFFE2EAF0), content = Color(0xFF4D5D6E)),
    ),
)

val DarkAppExtendedColors = AppExtendedColors(
    chatIncomingBubble = Color(0xFF223041),
    chatOutgoingBubble = Color(0xFF294867),
    premiumAccent = Color(0xFFD4CDA6),
    liveAccent = Color(0xFFDE7837),
    placeholderReadable = Color(0xFFAEB9C7),
    disabledReadable = Color(0xFFAEB9C7),
    sharedScrim = Color(0xCC000000),
    avatarFallbackPalette = listOf(
        AvatarFallbackColors(background = Color(0xFF294867), content = Color(0xFFEDF3FA)),
        AvatarFallbackColors(background = Color(0xFF223041), content = Color(0xFFEDF3FA)),
        AvatarFallbackColors(background = Color(0xFF564F37), content = Color(0xFFF3EDD0)),
        AvatarFallbackColors(background = Color(0xFF2C394B), content = Color(0xFFEDF3FA)),
    ),
)

val LocalAppExtendedColors = staticCompositionLocalOf { LightAppExtendedColors }

@Composable
fun appExtendedColors(): AppExtendedColors = LocalAppExtendedColors.current

val ColorScheme.isLightTheme: Boolean
    get() = background.red > 0.5f && background.green > 0.5f && background.blue > 0.5f
