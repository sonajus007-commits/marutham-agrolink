# Mobile app (Android / iOS)

The mobile app is the React portal (`apps/web`) wrapped natively with **Capacitor 7**.
The same web build runs in the browser (`/app`) and inside the native shell; there is
no separate mobile codebase. This doc is the build/release runbook.

- **App ID:** `com.marutham.agrolink`
- **App name:** Marutham AgroLink
- **Version:** `versionName` 1.0.0 / `versionCode` 1 (bump both in
  `apps/web/android/app/build.gradle` for each release — Play requires a higher
  `versionCode` every upload).
- **SDK:** min 23, target/compile 35.

## Prerequisites

- **JDK 21** — Capacitor 7 requires Java 21. With only JDK 17 the build dies on
  `:capacitor-filesystem:compileDebugJavaWithJavac` and never mentions the JDK. Set
  `JAVA_HOME` to a 21 before `./gradlew`.
- Android SDK (`source ~/android-sdk/env.sh` on the dev box).
- iOS: a **Mac with Xcode** — iOS cannot be built on Linux (see below).

## The web build the shell wraps

The native shell serves the bundle from its own root (not the Express `/app` mount),
and talks to the backend over the network (not same-origin), so:

```bash
# Point the app at the real backend (a device cannot reach localhost; an Android
# emulator reaches the host at 10.0.2.2). Then build + copy into the native project.
VITE_API_BASE_URL=https://YOUR_API_HOST/api pnpm --filter @marutham/web cap:sync
```

`cap:sync` runs `CAPACITOR=1 vite build` (base `/`) then `cap sync` (copies `dist/`
into `android/`).

## App icon & splash

Branded from `apps/web/assets/logo.png` (+ `logo-dark.png`). To regenerate after a
logo change:

```bash
pnpm --filter @marutham/web cap:assets
```

This writes the launcher icons and splash screens (light + dark) into
`android/app/src/main/res`. It uses `@capacitor/assets` via `npx` — deliberately not
a dependency, so CI stays lean.

## Release build (Android)

Release builds are **signed only when `keystore.properties` is present** (otherwise
the artifact is unsigned — fine for a local check, not uploadable to Play).

1. Create a keystore once and **keep it safe** — losing it means you can never update
   the app on Play:
   ```bash
   keytool -genkey -v -keystore apps/web/android/marutham-release.jks \
           -keyalg RSA -keysize 2048 -validity 10000 -alias marutham
   ```
2. Copy `apps/web/android/keystore.properties.example` to
   `apps/web/android/keystore.properties` and fill in the passwords/alias. Both the
   `.jks` and `keystore.properties` are git-ignored — never commit them.
3. Build:
   ```bash
   VITE_API_BASE_URL=https://YOUR_API_HOST/api pnpm --filter @marutham/web cap:sync
   cd apps/web/android && ./gradlew bundleRelease   # .aab for Play upload
   # or ./gradlew assembleRelease                    # .apk for direct install
   ```
   Output: `app/build/outputs/bundle/release/app-release.aab`.

> ⚠ This dev box is thermally limited — a full Gradle release build is heavy. Prefer
> a CI runner or a cooler machine for release builds.

## Push notifications (deferred)

The in-app notification bell works today. Native **push** needs a Firebase project:
drop `google-services.json` into `apps/web/android/app/` (the Gradle plugin activates
automatically when the file exists) and wire an APNs key for iOS. Until then push is
inert; nothing else depends on it. The `POST_NOTIFICATIONS` permission is already
declared.

## iOS

Not yet added, and it **cannot be built on this Linux machine** — iOS needs macOS +
Xcode. When on a Mac:

```bash
pnpm --filter @marutham/web exec cap add ios
pnpm --filter @marutham/web cap:assets   # (add --ios once the platform exists)
pnpm --filter @marutham/web exec cap open ios
```

Then set the bundle id (`com.marutham.agrolink`), signing team, icons/splash, and an
APNs key for push, and archive from Xcode. Everything platform-agnostic (the web
build, the API base, the icons source) is already in place here.

## Store listing (content to prepare)

- Title, short + full description (bilingual EN/TA available in-app for reference).
- Feature graphic (1024×500) and phone screenshots (from a device/emulator).
- Privacy policy URL — note the app links `/privacy`, currently an honest
  "being finalised" placeholder; Play requires a real one before publishing, same as
  the payment-gateway onboarding (see the go-live gap register).
