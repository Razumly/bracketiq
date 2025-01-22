package com.razumly.mvp.eventList.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRowDefaults.SecondaryIndicator
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.razumly.mvp.icons.Beach
import com.razumly.mvp.icons.Grass
import com.razumly.mvp.icons.Groups
import com.razumly.mvp.icons.Indoor
import com.razumly.mvp.icons.MVPIcons
import com.razumly.mvp.icons.Tournament

@Composable
fun FilterBar(modifier: Modifier = Modifier) {
    val tabs = listOf("Tournaments", "Beach", "Indoor", "Grass", "Groups")
    var selectedTabIndex by remember { mutableStateOf(0) }

    ScrollableTabRow(
        selectedTabIndex = selectedTabIndex,
        modifier = modifier
            .fillMaxWidth()
            // If you want more space, do .height(56.dp) or add .padding(vertical = X.dp)
            .height(56.dp),
        edgePadding = 0.dp,
        containerColor = Color.Transparent,
        indicator = { tabPositions ->
            // Default indicator is easier to see
            SecondaryIndicator(
                modifier = Modifier.tabIndicatorOffset(tabPositions[selectedTabIndex]),
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
        },
        // Typically, contentColor sets the default color for icons/text
        contentColor = MaterialTheme.colorScheme.onPrimaryContainer
    ) {
        tabs.forEachIndexed { index, title ->
            val isSelected = (index == selectedTabIndex)

            Tab(
                selected = isSelected,
                onClick = { selectedTabIndex = index },
                modifier = Modifier.padding(vertical = 4.dp), // extra vertical space
                text = {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp),
                        color = if (isSelected) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        }
                    )
                },
                icon = {
                    Icon(
                        when (title) {
                            "Tournaments" -> MVPIcons.Tournament
                            "Beach" -> MVPIcons.Beach
                            "Indoor" -> MVPIcons.Indoor
                            "Grass" -> MVPIcons.Grass
                            else -> MVPIcons.Groups
                        },
                        contentDescription = title,
                        tint = if (isSelected) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        }
                    )
                }
            )
        }
    }
}