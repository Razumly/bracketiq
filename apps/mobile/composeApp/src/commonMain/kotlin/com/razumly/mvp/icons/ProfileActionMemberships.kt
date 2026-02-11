package com.razumly.mvp.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

val MVPIcons.ProfileActionMemberships: ImageVector
    get() {
        if (_ProfileActionMemberships != null) {
            return _ProfileActionMemberships!!
        }
        _ProfileActionMemberships = ImageVector.Builder(
            name = "ProfileActionMemberships",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(fill = SolidColor(Color.Black)) {
                moveTo(20f, 6f)
                horizontalLineToRelative(-2f)
                verticalLineTo(4f)
                curveToRelative(0f, -1.11f, -0.89f, -2f, -2f, -2f)
                horizontalLineTo(8f)
                curveTo(6.89f, 2f, 6f, 2.89f, 6f, 4f)
                verticalLineToRelative(2f)
                horizontalLineTo(4f)
                curveTo(2.89f, 6f, 2f, 6.89f, 2f, 8f)
                verticalLineToRelative(10f)
                curveToRelative(0f, 1.11f, 0.89f, 2f, 2f, 2f)
                horizontalLineToRelative(16f)
                curveToRelative(1.11f, 0f, 2f, -0.89f, 2f, -2f)
                verticalLineTo(8f)
                curveToRelative(0f, -1.11f, -0.89f, -2f, -2f, -2f)
                close()
                moveTo(8f, 4f)
                horizontalLineToRelative(8f)
                verticalLineToRelative(2f)
                horizontalLineTo(8f)
                verticalLineTo(4f)
                close()
                moveTo(20f, 18f)
                horizontalLineTo(4f)
                verticalLineTo(8f)
                horizontalLineToRelative(16f)
                verticalLineToRelative(10f)
                close()
                moveTo(12f, 9.67f)
                lineToRelative(0.93f, 2.12f)
                lineToRelative(2.31f, 0.2f)
                lineToRelative(-1.75f, 1.52f)
                lineToRelative(0.53f, 2.28f)
                lineTo(12f, 14.59f)
                lineTo(9.98f, 15.79f)
                lineToRelative(0.53f, -2.28f)
                lineToRelative(-1.75f, -1.52f)
                lineToRelative(2.31f, -0.2f)
                lineTo(12f, 9.67f)
                close()
            }
        }.build()

        return _ProfileActionMemberships!!
    }

@Suppress("ObjectPropertyName")
private var _ProfileActionMemberships: ImageVector? = null
