package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.razumly.mvp.core.util.Platform

@Composable
internal fun EmailSignInButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isDarkTheme = isSystemInDarkTheme()
    val isIOS = Platform.isIOS

    val (width, height, fontSize) = when {
        isIOS -> Triple(199.dp, 44.dp, 16.sp)
        else -> Triple(189.dp, 40.dp, 14.sp)
    }

    // Platform-specific icon padding
    val sidePadding = if (isIOS) 16.dp else 12.dp

    val (backgroundColor, borderColor, textColor) = when {
        isDarkTheme -> Triple(
            Color(0xFF131314),
            Color(0xFF8E918F),
            Color(0xFFE3E3E3)
        )
        else -> Triple(
            Color(0xFFFFFFFF),
            Color(0xFF747775),
            Color(0xFF1F1F1F)
        )
    }

    Box(
        modifier = modifier
            .size(width, height)
            .clip(RoundedCornerShape(height / 2))
            .background(backgroundColor)
            .border(1.dp, borderColor, RoundedCornerShape(height / 2))
            .clickable { onClick() }
            .padding(horizontal = sidePadding),
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(
                imageVector = Icons.Filled.Email,
                contentDescription = "Email icon",
                tint = textColor,
                modifier = Modifier.size(20.dp)
            )
            Text(
                text = text,
                color = textColor,
                fontSize = fontSize,
                fontWeight = FontWeight.Medium
            )
        }
    }
}