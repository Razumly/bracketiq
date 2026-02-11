package com.razumly.mvp.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

val MVPIcons.ProfileActionDetails: ImageVector
    get() {
        if (_ProfileActionDetails != null) {
            return _ProfileActionDetails!!
        }
        _ProfileActionDetails = ImageVector.Builder(
            name = "ProfileActionDetails",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(fill = SolidColor(Color.Black)) {
                moveTo(12f, 2f)
                curveTo(6.48f, 2f, 2f, 6.48f, 2f, 12f)
                reflectiveCurveToRelative(4.48f, 10f, 10f, 10f)
                reflectiveCurveToRelative(10f, -4.48f, 10f, -10f)
                reflectiveCurveTo(17.52f, 2f, 12f, 2f)
                close()
                moveTo(12f, 6f)
                curveToRelative(1.93f, 0f, 3.5f, 1.57f, 3.5f, 3.5f)
                reflectiveCurveTo(13.93f, 13f, 12f, 13f)
                reflectiveCurveToRelative(-3.5f, -1.57f, -3.5f, -3.5f)
                reflectiveCurveTo(10.07f, 6f, 12f, 6f)
                close()
                moveTo(12f, 20f)
                curveToRelative(-2.03f, 0f, -3.82f, -0.82f, -5.11f, -2.11f)
                curveToRelative(0.03f, -2.26f, 4.03f, -3.49f, 5.11f, -3.49f)
                reflectiveCurveToRelative(5.08f, 1.23f, 5.11f, 3.49f)
                arcTo(7.95f, 7.95f, 0f, isMoreThanHalf = false, isPositiveArc = true, 12f, 20f)
                close()
            }
        }.build()

        return _ProfileActionDetails!!
    }

@Suppress("ObjectPropertyName")
private var _ProfileActionDetails: ImageVector? = null
