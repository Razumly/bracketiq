package com.razumly.mvp.core.network

/**
 * Base URL for the Next.js API (no trailing `/api`), e.g. `http://10.0.2.2:3000`.
 *
 * Android: backed by `BuildConfig.MVP_API_BASE_URL` (Secrets Gradle plugin).
 * iOS: backed by `Secrets.plist` key `mvpApiBaseUrl`.
 */
expect val apiBaseUrl: String

