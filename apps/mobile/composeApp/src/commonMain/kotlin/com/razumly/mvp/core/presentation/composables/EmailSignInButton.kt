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
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier
) {
    val isDarkTheme = isSystemInDarkTheme()
    val isIOS = Platform.isIOS

    val (width, height, sidePadding) = when {
        isIOS -> {
            val aspectRatio = 199f / 44f
            val buttonHeight = 50.dp
            val buttonWidth = buttonHeight * aspectRatio
            val paddingRatio = 16f / 44f
            Triple(buttonWidth, buttonHeight, buttonHeight * paddingRatio)
        }

        else -> {
            val aspectRatio = 189f / 40f
            val buttonHeight = 50.dp
            val buttonWidth = buttonHeight * aspectRatio
            val paddingRatio = 12f / 40f
            Triple(buttonWidth, buttonHeight, buttonHeight * paddingRatio)
        }
    }
    val topPadding = when {
        isIOS -> 12.dp
        else -> 10.dp
    }
    val fontSize = when {
        isIOS -> {
            val aspectRatio = 199f / 44f

        }
        else -> 14.sp
    }

    val (backgroundColor, borderColor, textColor) = when {
        isDarkTheme -> Triple(
            Color(0xFF131314), Color(0xFF8E918F), Color(0xFFE3E3E3)
        )

        else -> Triple(
            Color(0xFFFFFFFF), Color(0xFF747775), Color(0xFF1F1F1F)
        )
    }

    Box(modifier = modifier.size(width, height).clip(RoundedCornerShape(height / 2))
        .background(backgroundColor).border(1.dp, borderColor, RoundedCornerShape(height / 2))
        .clickable { onClick() }.padding(horizontal = sidePadding),
        contentAlignment = Alignment.Center) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(
                imageVector = Icons.Filled.Email,
                contentDescription = "Email icon",
                tint = textColor,
                modifier = Modifier.size(height - topPadding * 2)
            )
            Text(
                text = text, color = textColor, fontSize = 15.sp, fontWeight = FontWeight.Medium
            )
        }
    }
}