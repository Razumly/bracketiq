This is a Kotlin Multiplatform project targeting Android, iOS.

* `/composeApp` is for code that will be shared across your Compose Multiplatform applications.
  It contains several subfolders:
  - `commonMain` is for code that’s common for all targets.
  - Other folders are for Kotlin code that will be compiled for only the platform indicated in the folder name.
    For example, if you want to use Apple’s CoreCrypto for the iOS part of your Kotlin app,
    `iosMain` would be the right folder for such calls.

* `/iosApp` contains iOS applications. Even if you’re sharing your UI with Compose Multiplatform, 
  you need this entry point for your iOS app. This is also where you should add SwiftUI code for your project.


Learn more about [Kotlin Multiplatform](https://www.jetbrains.com/help/kotlin-multiplatform-dev/get-started.html)…

## Android Firebase configuration

`composeApp/google-services.json` is environment-specific and intentionally ignored by Git. A fresh clone can build and run the Android debug app and unit tests without it; Firebase push notifications, Firebase Analytics, and Android Google sign-in remain unavailable until a real configuration is provisioned. Android release builds fail early when the file is missing so an unconfigured app cannot be shipped accidentally.

Download the Android configuration for package `com.razumly.mvp` from the approved Firebase project, then provision it without adding it to Git:

```bash
./scripts/provision-google-services.sh /secure/path/google-services.json
```

The same script accepts `MVP_GOOGLE_SERVICES_JSON_PATH`. In CI, store the complete JSON as a masked base64 secret named `MVP_GOOGLE_SERVICES_JSON_BASE64`, provision it before Gradle runs, and then build normally:

```bash
MVP_GOOGLE_SERVICES_JSON_BASE64="$MVP_GOOGLE_SERVICES_JSON_BASE64" \
  ./scripts/provision-google-services.sh
./gradlew :composeApp:bundleRelease
```

The provisioner validates the Firebase project metadata, the `com.razumly.mvp` Android client, its API key, and the OAuth web client required by Google sign-in. It writes the local file with owner-only permissions and never prints its contents. Firebase client identifiers are embedded in shipped apps, but this project keeps them out of source control and relies on Firebase/Google package, signing-certificate, and API restrictions.

Run `./scripts/tests/google-services-config-contract.sh` after changing this setup.
