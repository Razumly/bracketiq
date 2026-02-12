package com.razumly.mvp.core.network

/**
 * Base URL for the Next.js API (no trailing `/api`), e.g. `http://10.0.2.2:3001`.
 *
 * Android: backed by `BuildConfig.MVP_API_BASE_URL` (Secrets Gradle plugin), with a local
 * `3000 -> 3001` fallback when `3000` is down and `3001` is reachable.
 * iOS: backed by `Secrets.plist` key `mvpApiBaseUrl`.
 */
expect val apiBaseUrl: String
