package com.razumly.mvp.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

val MVPIcons.ProfileActionPaymentPlans: ImageVector
    get() {
        if (_ProfileActionPaymentPlans != null) {
            return _ProfileActionPaymentPlans!!
        }
        _ProfileActionPaymentPlans = ImageVector.Builder(
            name = "ProfileActionPaymentPlans",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(fill = SolidColor(Color.Black)) {
                moveTo(19f, 3f)
                horizontalLineToRelative(-1f)
                verticalLineTo(1f)
                horizontalLineToRelative(-2f)
                verticalLineToRelative(2f)
                horizontalLineTo(8f)
                verticalLineTo(1f)
                horizontalLineTo(6f)
                verticalLineToRelative(2f)
                horizontalLineTo(5f)
                curveTo(3.9f, 3f, 3f, 3.9f, 3f, 5f)
                verticalLineToRelative(14f)
                curveToRelative(0f, 1.1f, 0.9f, 2f, 2f, 2f)
                horizontalLineToRelative(14f)
                curveToRelative(1.1f, 0f, 2f, -0.9f, 2f, -2f)
                verticalLineTo(5f)
                curveToRelative(0f, -1.1f, -0.9f, -2f, -2f, -2f)
                close()
                moveTo(19f, 19f)
                horizontalLineTo(5f)
                verticalLineTo(8f)
                horizontalLineToRelative(14f)
                verticalLineTo(19f)
                close()
            }
            path(fill = SolidColor(Color.Black)) {
                moveTo(12.5f, 16.5f)
                verticalLineToRelative(1f)
                horizontalLineToRelative(-1f)
                verticalLineToRelative(-1f)
                curveToRelative(-1.1f, -0.09f, -2f, -0.7f, -2f, -1.8f)
                horizontalLineToRelative(1.2f)
                curveToRelative(0.07f, 0.45f, 0.37f, 0.9f, 1.3f, 0.9f)
                curveToRelative(1f, 0f, 1.2f, -0.5f, 1.2f, -0.8f)
                curveToRelative(0f, -0.43f, -0.23f, -0.83f, -1.3f, -1.09f)
                curveToRelative(-1.19f, -0.29f, -2.01f, -0.78f, -2.01f, -1.99f)
                curveToRelative(0f, -1.01f, 0.81f, -1.67f, 1.91f, -1.79f)
                verticalLineTo(9f)
                horizontalLineToRelative(1f)
                verticalLineToRelative(0.92f)
                curveToRelative(1.03f, 0.1f, 1.54f, 0.78f, 1.72f, 1.58f)
                horizontalLineToRelative(-1.24f)
                curveToRelative(-0.1f, -0.43f, -0.35f, -0.78f, -0.98f, -0.78f)
                curveToRelative(-0.52f, 0f, -1.1f, 0.23f, -1.1f, 0.86f)
                curveToRelative(0f, 0.55f, 0.45f, 0.73f, 1.3f, 0.95f)
                curveToRelative(0.85f, 0.22f, 2.01f, 0.59f, 2.01f, 2.12f)
                curveToRelative(0f, 1.07f, -0.79f, 1.76f, -2.03f, 1.85f)
                close()
            }
        }.build()

        return _ProfileActionPaymentPlans!!
    }

@Suppress("ObjectPropertyName")
private var _ProfileActionPaymentPlans: ImageVector? = null
