# Push + Email Rollout Guide

This app now sends push-notification intents through existing backend messaging routes and automatically registers/unregisters a device target when auth state changes.

To make "every backend email also tries push" work end-to-end, complete the backend + Firebase setup below.

## 1. Firebase Project Setup

1. Create or reuse one Firebase project for MVP mobile push.
2. Add Android app (`com.razumly.mvp`) and keep `composeApp/google-services.json` up to date.
3. Add iOS app (bundle ID used by `iosApp`) and keep `iosApp/GoogleService-Info.plist` up to date.
4. In Firebase Console, enable Cloud Messaging.
5. For iOS, configure APNs key/certificate in Firebase Cloud Messaging settings.

## 2. Backend Data Model (mvp-site)

In `mvp-site`, add persistent device target storage (for example a `DeviceTargets` table/model) with at least:

- `id` (string/uuid)
- `userId` (string, indexed)
- `pushToken` (string, indexed)
- `pushTarget` (string)
- `platform` (optional string)
- `lastSeenAt` (timestamp)
- `active` (boolean)

This is required because current messaging routes do not persist push tokens.

## 3. Backend Route Wiring (mvp-site)

Update the existing route:

- `src/app/api/messaging/topics/[topicId]/subscriptions/route.ts`

So that when request body includes `pushToken`/`pushTarget`, it upserts device-target records for the `userIds` in that request.

The mobile app now sends those fields during `addDeviceAsTarget()` and token refresh callbacks.

## 4. Push Delivery Service (mvp-site)

Add a server service (for example `src/server/push.ts`) that:

1. Looks up active device tokens by `userId` or topic membership.
2. Sends notifications via Firebase Admin SDK.
3. Handles invalid-token cleanup (mark inactive or remove stale tokens).

Required server env vars usually include:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

## 5. Email + Push Parity Hook

In every backend path that sends email, call push as a best-effort companion operation.

At minimum, start with invite email flows:

- `src/server/inviteEmails.ts`
- `src/app/api/invites/route.ts`
- `src/app/api/users/invite/route.ts`

Recommended behavior:

1. Send email.
2. Attempt push for the same logical event.
3. Never fail the main API request solely because push failed.
4. Log push failures with invite/user identifiers.

## 6. Verification Flow

1. Sign in on mobile and allow notifications.
2. Confirm backend receives topic subscription requests with `pushToken`/`pushTarget`.
3. Trigger an invite/email action from backend.
4. Verify:
- email is sent
- push is attempted
- push appears on device when token exists

## 7. Current App-Side Behavior Added in This Repo

- Push repository methods are no longer no-op stubs.
- Messaging calls now use backend routes under `/api/messaging/topics/...`.
- Device target register/unregister is tied to auth state changes.
- Team invite creation now also attempts a user push notification.
