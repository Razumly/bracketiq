package com.razumly.mvp.core.presentation

import androidx.compose.foundation.layout.WindowInsets

// The app shell owns safe-area and bottom-nav spacing, so nested Scaffolds should not add it again.
val NoScaffoldContentInsets: WindowInsets = WindowInsets()
