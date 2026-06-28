package com.razumly.mvp.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

val MVPIcons.Trophy: ImageVector
    get() {
        if (_Trophy != null) {
            return _Trophy!!
        }
        _Trophy = ImageVector.Builder(
            name = "Trophy",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 512f,
            viewportHeight = 512f
        ).apply {
            path(fill = SolidColor(Color(0xFF000000))) {
                moveTo(141.58f, 464f)
                horizontalLineToRelative(221.09f)
                verticalLineToRelative(48f)
                horizontalLineToRelative(-221.09f)
                close()
            }
            path(fill = SolidColor(Color(0xFF000000))) {
                moveTo(389.82f, 16.48f)
                curveToRelative(0f, -10.17f, 0f, -16.48f, 0f, -16.48f)
                horizontalLineTo(250.18f)
                horizontalLineTo(110.54f)
                curveToRelative(0f, 0f, 0f, 6.32f, 0f, 16.48f)
                horizontalLineTo(22.72f)
                horizontalLineToRelative(-0.18f)
                horizontalLineToRelative(-0.24f)
                verticalLineToRelative(80.48f)
                curveToRelative(0f, 28.69f, 10.26f, 55.17f, 28.89f, 74.58f)
                curveToRelative(18.96f, 19.75f, 45.36f, 31.64f, 78.67f, 35.52f)
                curveToRelative(31.88f, 49.89f, 92.05f, 77.33f, 92.05f, 100.43f)
                curveToRelative(0f, 31.42f, -31.42f, 84.83f, -31.42f, 84.83f)
                verticalLineToRelative(34.25f)
                verticalLineToRelative(0.07f)
                verticalLineToRelative(0.24f)
                horizontalLineToRelative(119.39f)
                verticalLineTo(392.32f)
                curveToRelative(0f, 0f, -31.42f, -53.41f, -31.42f, -84.83f)
                curveToRelative(0f, -22.94f, 59.33f, -50.16f, 91.37f, -99.4f)
                curveToRelative(39.16f, -2.19f, 69.74f, -14.43f, 90.97f, -36.55f)
                curveToRelative(18.63f, -19.41f, 28.89f, -45.89f, 28.89f, -74.58f)
                verticalLineTo(16.48f)
                horizontalLineTo(389.82f)
                close()
                moveTo(59.15f, 96.97f)
                verticalLineTo(53.33f)
                horizontalLineToRelative(51.39f)
                curveToRelative(0f, 30.26f, 0f, 66.66f, 0f, 90.18f)
                curveToRelative(0f, 6.73f, 0.71f, 13.11f, 1.79f, 19.29f)
                curveToRelative(0.16f, 1.16f, 0.26f, 2.31f, 0.45f, 3.47f)
                curveTo(65.23f, 152.39f, 59.15f, 115.04f, 59.15f, 96.97f)
                close()
                moveTo(190.25f, 146.36f)
                lineToRelative(-0.09f, 41.72f)
                curveToRelative(-23.19f, -10f, -44.71f, -43.11f, -44.71f, -56.37f)
                curveToRelative(0f, -13.28f, 0f, -92.92f, 0f, -92.92f)
                horizontalLineToRelative(44.8f)
                curveTo(190.25f, 38.79f, 190.25f, 92.04f, 190.25f, 146.36f)
                close()
                moveTo(452.85f, 96.97f)
                curveToRelative(0f, 15.85f, -4.68f, 46.53f, -37.91f, 63.2f)
                curveToRelative(-7.72f, 3.84f, -16.97f, 6.92f, -28.06f, 8.88f)
                curveToRelative(1.88f, -8.04f, 2.94f, -16.53f, 2.94f, -25.53f)
                curveToRelative(0f, -23.52f, 0f, -59.93f, 0f, -90.18f)
                horizontalLineToRelative(63.03f)
                verticalLineTo(96.97f)
                close()
            }
        }.build()

        return _Trophy!!
    }

@Suppress("ObjectPropertyName")
private var _Trophy: ImageVector? = null
