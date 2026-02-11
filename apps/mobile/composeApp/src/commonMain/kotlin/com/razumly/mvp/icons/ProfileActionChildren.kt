package com.razumly.mvp.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

val MVPIcons.ProfileActionChildren: ImageVector
    get() {
        if (_ProfileActionChildren != null) {
            return _ProfileActionChildren!!
        }
        _ProfileActionChildren = ImageVector.Builder(
            name = "ProfileActionChildren",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(fill = SolidColor(Color.Black)) {
                moveTo(8.6f, 10f)
                moveToRelative(-2.3f, 0f)
                arcToRelative(2.3f, 2.3f, 0f, isMoreThanHalf = true, isPositiveArc = true, 4.6f, 0f)
                arcToRelative(2.3f, 2.3f, 0f, isMoreThanHalf = true, isPositiveArc = true, -4.6f, 0f)
            }
            path(fill = SolidColor(Color.Black)) {
                moveTo(3.2f, 19f)
                verticalLineToRelative(-1.2f)
                curveToRelative(0f, -2.5f, 2.9f, -4.1f, 5.3f, -4.1f)
                reflectiveCurveToRelative(5.3f, 1.6f, 5.3f, 4.1f)
                verticalLineTo(19f)
                horizontalLineTo(3.2f)
                close()
            }
            path(fill = SolidColor(Color.Black)) {
                moveTo(16.7f, 10.8f)
                moveToRelative(-1.7f, 0f)
                arcToRelative(1.7f, 1.7f, 0f, isMoreThanHalf = true, isPositiveArc = true, 3.4f, 0f)
                arcToRelative(1.7f, 1.7f, 0f, isMoreThanHalf = true, isPositiveArc = true, -3.4f, 0f)
            }
            path(fill = SolidColor(Color.Black)) {
                moveTo(13f, 19f)
                verticalLineToRelative(-1f)
                curveToRelative(0f, -2f, 1.9f, -3.3f, 3.4f, -3.3f)
                reflectiveCurveToRelative(3.4f, 1.3f, 3.4f, 3.3f)
                verticalLineTo(19f)
                horizontalLineTo(13f)
                close()
            }
        }.build()

        return _ProfileActionChildren!!
    }

@Suppress("ObjectPropertyName")
private var _ProfileActionChildren: ImageVector? = null
