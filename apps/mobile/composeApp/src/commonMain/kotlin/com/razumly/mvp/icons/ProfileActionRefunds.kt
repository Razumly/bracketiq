package com.razumly.mvp.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

val MVPIcons.ProfileActionRefunds: ImageVector
    get() {
        if (_ProfileActionRefunds != null) {
            return _ProfileActionRefunds!!
        }
        _ProfileActionRefunds = ImageVector.Builder(
            name = "ProfileActionRefunds",
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
                moveTo(11f, 15f)
                horizontalLineToRelative(2f)
                arcToRelative(2f, 2f, 0f, isMoreThanHalf = true, isPositiveArc = false, 0f, -4f)
                horizontalLineToRelative(-3f)
                curveToRelative(-0.6f, 0f, -1.1f, 0.2f, -1.4f, 0.6f)
                lineTo(3f, 17f)
            }
            path(
                fill = SolidColor(Color.Transparent),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveToRelative(7f, 21f)
                lineToRelative(1.6f, -1.4f)
                curveToRelative(0.3f, -0.4f, 0.8f, -0.6f, 1.4f, -0.6f)
                horizontalLineToRelative(4f)
                curveToRelative(1.1f, 0f, 2.1f, -0.4f, 2.8f, -1.2f)
                lineToRelative(4.6f, -4.4f)
                arcToRelative(2f, 2f, 0f, isMoreThanHalf = false, isPositiveArc = false, -2.75f, -2.91f)
                lineToRelative(-4.2f, 3.9f)
            }
            path(
                fill = SolidColor(Color.Transparent),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveToRelative(2f, 16f)
                lineToRelative(6f, 6f)
            }
            path(
                fill = SolidColor(Color.Transparent),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(16f, 9f)
                moveToRelative(-2.9f, 0f)
                arcToRelative(2.9f, 2.9f, 0f, isMoreThanHalf = true, isPositiveArc = true, 5.8f, 0f)
                arcToRelative(2.9f, 2.9f, 0f, isMoreThanHalf = true, isPositiveArc = true, -5.8f, 0f)
            }
            path(
                fill = SolidColor(Color.Transparent),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(6f, 5f)
                moveToRelative(-3f, 0f)
                arcToRelative(3f, 3f, 0f, isMoreThanHalf = true, isPositiveArc = true, 6f, 0f)
                arcToRelative(3f, 3f, 0f, isMoreThanHalf = true, isPositiveArc = true, -6f, 0f)
            }
        }.build()

        return _ProfileActionRefunds!!
    }

@Suppress("ObjectPropertyName")
private var _ProfileActionRefunds: ImageVector? = null
