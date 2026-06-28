package com.razumly.mvp.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

val MVPIcons.PaymentProviderStripe: ImageVector
    get() {
        if (_PaymentProviderStripe != null) {
            return _PaymentProviderStripe!!
        }
        _PaymentProviderStripe = ImageVector.Builder(
            name = "PaymentProviderStripe",
            defaultWidth = 360.dp,
            defaultHeight = 151.dp,
            viewportWidth = 360f,
            viewportHeight = 151f
        ).apply {
            path(
                fill = SolidColor(Color(0xFF061B31)),
                pathFillType = PathFillType.EvenOdd
            ) {
                moveTo(360f, 78.2f)
                curveTo(360f, 52.6f, 347.6f, 32.4f, 323.9f, 32.4f)
                curveTo(300.1f, 32.4f, 285.7f, 52.6f, 285.7f, 78f)
                curveTo(285.7f, 108.1f, 302.7f, 123.3f, 327.1f, 123.3f)
                curveTo(339f, 123.3f, 348f, 120.6f, 354.8f, 116.8f)
                verticalLineTo(96.8f)
                curveTo(348f, 100.2f, 340.2f, 102.3f, 330.3f, 102.3f)
                curveTo(320.6f, 102.3f, 312f, 98.9f, 310.9f, 87.1f)
                horizontalLineTo(359.8f)
                curveTo(359.8f, 85.8f, 360f, 80.6f, 360f, 78.2f)
                close()
                moveTo(310.6f, 68.7f)
                curveTo(310.6f, 57.4f, 317.5f, 52.7f, 323.8f, 52.7f)
                curveTo(329.9f, 52.7f, 336.4f, 57.4f, 336.4f, 68.7f)
                horizontalLineTo(310.6f)
                close()
            }
            path(
                fill = SolidColor(Color(0xFF061B31)),
                pathFillType = PathFillType.EvenOdd
            ) {
                moveTo(247.1f, 32.4f)
                curveTo(237.3f, 32.4f, 231f, 37f, 227.5f, 40.2f)
                lineTo(226.2f, 34f)
                horizontalLineTo(204.2f)
                verticalLineTo(150.6f)
                lineTo(229.2f, 145.3f)
                lineTo(229.3f, 117f)
                curveTo(232.9f, 119.6f, 238.2f, 123.3f, 247f, 123.3f)
                curveTo(264.9f, 123.3f, 281.2f, 108.9f, 281.2f, 77.2f)
                curveTo(281.1f, 48.2f, 264.6f, 32.4f, 247.1f, 32.4f)
                close()
                moveTo(241.1f, 101.3f)
                curveTo(235.2f, 101.3f, 231.7f, 99.2f, 229.3f, 96.6f)
                lineTo(229.2f, 59.5f)
                curveTo(231.8f, 56.6f, 235.4f, 54.6f, 241.1f, 54.6f)
                curveTo(250.2f, 54.6f, 256.5f, 64.8f, 256.5f, 77.9f)
                curveTo(256.5f, 91.3f, 250.3f, 101.3f, 241.1f, 101.3f)
                close()
            }
            path(
                fill = SolidColor(Color(0xFF061B31)),
                pathFillType = PathFillType.EvenOdd
            ) {
                moveTo(169.8f, 26.5f)
                lineTo(194.9f, 21.1f)
                verticalLineTo(0.8f)
                lineTo(169.8f, 6.1f)
                verticalLineTo(26.5f)
                close()
            }
            path(fill = SolidColor(Color(0xFF061B31))) {
                moveTo(194.9f, 34.1f)
                horizontalLineTo(169.8f)
                verticalLineTo(121.6f)
                horizontalLineTo(194.9f)
                verticalLineTo(34.1f)
                close()
            }
            path(
                fill = SolidColor(Color(0xFF061B31)),
                pathFillType = PathFillType.EvenOdd
            ) {
                moveTo(142.9f, 41.5f)
                lineTo(141.3f, 34.1f)
                horizontalLineTo(119.7f)
                verticalLineTo(121.6f)
                horizontalLineTo(144.7f)
                verticalLineTo(62.3f)
                curveTo(150.6f, 54.6f, 160.6f, 56f, 163.7f, 57.1f)
                verticalLineTo(34.1f)
                curveTo(160.5f, 32.9f, 148.8f, 30.7f, 142.9f, 41.5f)
                close()
            }
            path(
                fill = SolidColor(Color(0xFF061B31)),
                pathFillType = PathFillType.EvenOdd
            ) {
                moveTo(92.9f, 12.4f)
                lineTo(68.5f, 17.6f)
                lineTo(68.4f, 97.7f)
                curveTo(68.4f, 112.5f, 79.5f, 123.4f, 94.3f, 123.4f)
                curveTo(102.5f, 123.4f, 108.5f, 121.9f, 111.8f, 120.1f)
                verticalLineTo(99.8f)
                curveTo(108.6f, 101.1f, 92.8f, 105.7f, 92.8f, 90.9f)
                verticalLineTo(55.4f)
                horizontalLineTo(111.8f)
                verticalLineTo(34.1f)
                horizontalLineTo(92.8f)
                lineTo(92.9f, 12.4f)
                close()
            }
            path(
                fill = SolidColor(Color(0xFF061B31)),
                pathFillType = PathFillType.EvenOdd
            ) {
                moveTo(25.3f, 59.5f)
                curveTo(25.3f, 55.6f, 28.5f, 54.1f, 33.8f, 54.1f)
                curveTo(41.4f, 54.1f, 51f, 56.4f, 58.6f, 60.5f)
                verticalLineTo(37f)
                curveTo(50.3f, 33.7f, 42.1f, 32.4f, 33.8f, 32.4f)
                curveTo(13.5f, 32.4f, 0f, 43f, 0f, 60.7f)
                curveTo(0f, 88.3f, 38f, 83.9f, 38f, 95.8f)
                curveTo(38f, 100.4f, 34f, 101.9f, 28.4f, 101.9f)
                curveTo(20.1f, 101.9f, 9.5f, 98.5f, 1.1f, 93.9f)
                verticalLineTo(117.7f)
                curveTo(10.4f, 121.7f, 19.8f, 123.4f, 28.4f, 123.4f)
                curveTo(49.2f, 123.4f, 63.5f, 113.1f, 63.5f, 95.2f)
                curveTo(63.4f, 65.4f, 25.3f, 70.7f, 25.3f, 59.5f)
                close()
            }
        }.build()

        return _PaymentProviderStripe!!
    }

@Suppress("ObjectPropertyName")
private var _PaymentProviderStripe: ImageVector? = null
