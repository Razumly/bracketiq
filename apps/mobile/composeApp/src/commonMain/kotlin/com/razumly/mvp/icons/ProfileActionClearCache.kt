package com.razumly.mvp.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

val MVPIcons.ProfileActionClearCache: ImageVector
    get() {
        if (_ProfileActionClearCache != null) {
            return _ProfileActionClearCache!!
        }
        _ProfileActionClearCache = ImageVector.Builder(
            name = "ProfileActionClearCache",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(
                fill = SolidColor(Color.Transparent),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(21f, 12f)
                arcToRelative(9f, 9f, 0f, isMoreThanHalf = false, isPositiveArc = false, -9f, -9f)
                arcToRelative(9.75f, 9.75f, 0f, isMoreThanHalf = false, isPositiveArc = false, -6.74f, 2.74f)
                lineTo(3f, 8f)
            }
            path(
                fill = SolidColor(Color.Transparent),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(3f, 3f)
                verticalLineToRelative(5f)
                horizontalLineToRelative(5f)
            }
            path(
                fill = SolidColor(Color.Transparent),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(3f, 12f)
                arcToRelative(9f, 9f, 0f, isMoreThanHalf = false, isPositiveArc = false, 9f, 9f)
                arcToRelative(9.75f, 9.75f, 0f, isMoreThanHalf = false, isPositiveArc = false, 6.74f, -2.74f)
                lineTo(21f, 16f)
            }
            path(
                fill = SolidColor(Color.Transparent),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(16f, 16f)
                horizontalLineToRelative(5f)
                verticalLineToRelative(5f)
            }
        }.build()

        return _ProfileActionClearCache!!
    }

@Suppress("ObjectPropertyName")
private var _ProfileActionClearCache: ImageVector? = null
