package com.razumly.mvp.teamManagement.composables

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun InvitePlayerCard(modifier: Modifier, onClick: () -> Unit) {
    Card(modifier.padding(vertical = 4.dp, horizontal = 64.dp).clickable { onClick() }) {
        Row(Modifier.padding(8.dp), horizontalArrangement = Arrangement.Start) {
            Icon(
                Icons.Default.Add,
                contentDescription = "Invite",
                modifier = Modifier.padding(end = 8.dp)
            )
            Text("Invite Player")
        }
    }
}