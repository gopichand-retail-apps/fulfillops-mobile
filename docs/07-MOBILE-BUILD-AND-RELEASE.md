# Local build and operations

Use Node 24.15.0, npm 11.12.1, PostgreSQL 18.7 tools, JDK 17, Android SDK/build-tools 37, NDK 27.1.12297006 and CMake 3.31.6 for the verified Windows build. Expo 58.0.26, React Native 0.88.1, React 19.3.0 and native modules are locked in `package-lock.json`. [Expo SDK compatibility](https://docs.expo.dev/versions/v58.0.0/)

## Dedicated local IT setup

From OrderFlow, put the workspace Node directory first on PATH. Set `ANDROID_SDK_ROOT` to the task's `ANDROID_HOME`. Probe ports before launching. Existing task-owned listeners can be reused after checking their identity and readiness.

```powershell
node ..\..\scripts\check-ports.mjs 5761 5762 5763
npm.cmd ci
.\tools\local-db.ps1 -PgBin '<local PostgreSQL bin directory>'
npm.cmd run api
```

The database setup creates an app-owned cluster at `127.0.0.1:5763` with separate IT and test databases. It writes ignored connection settings and applies checksummed migrations. Install compatible binaries separately or point to an existing verified local binary directory. The API listens on `127.0.0.1:5761`. Check `/readyz` before starting the client. It returns HTTP 200 with `status: ok` when the expected schema is available.

For first use, place a chosen synthetic owner password of at least 12 characters in `.local/owner-password.txt`. Keep it private. Bootstrap once and use the printed site ID to create an invitation. Remove the password input file after bootstrap is verified.

```powershell
npm.cmd run operator -- bootstrap "OrderFlow IT" "North distribution" "America/Chicago" "orderflow-owner"
npm.cmd run operator -- invite '<site UUID>' floor-operator supervisor,picker,packer,handoff
```

Open the invitation file in `.local/` privately. Redeem it in the app, set a password, then sign in as the invited staff ID. Assign smaller role sets for distinct staff accounts. Revoke a grant with `npm.cmd run operator -- revoke '<site UUID>' '<staff ID>'`. If a synthetic first owner already exists, use its dedicated operator setup.

## Connected Android development profile

Generate the native Android project with `ORDERFLOW_DEBUG=1`. Run the Gradle wrapper from `android/` and start Metro from the OrderFlow root with the same environment. The following build targets the named x86_64 emulator.

```powershell
$env:ORDERFLOW_DEBUG = '1'
$env:EXPO_NO_TELEMETRY = '1'
npm.cmd exec -- expo prebuild --clean --platform android --no-install
Push-Location android
.\gradlew.bat --init-script ..\tools\windows-cmake.init.gradle :app:assembleDebug -PreactNativeArchitectures=x86_64 --max-workers=2 --console=plain
Pop-Location
npm.cmd run start
```

From a second terminal, verify the AVD name and then apply the explicitly scoped mappings. This checkout used the `OrderFlow_IT_API35` AVD on `emulator-5590`.

```powershell
adb -s emulator-5590 emu avd name
adb -s emulator-5590 reverse tcp:5761 tcp:5761
adb -s emulator-5590 reverse tcp:5762 tcp:5762
adb -s emulator-5590 install android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5590 shell am start -a android.intent.action.VIEW -d 'exp+orderflow://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A5762' com.orderflowmobile.app.dev
```

Enter a synthetic manual release, select it in the queue and claim it as a picker. Choose the line and confirm the manual SKU or use the camera where available. Packing, observed handoff and return dispositions depend on current grants and committed quantities.

## Standalone Android preview

Generate with `ORDERFLOW_DEBUG=0` in the same commands and run `:app:assembleRelease` instead. Pass `"-PreactNativeArchitectures=arm64-v8a,x86_64"` to the Gradle wrapper to include both supported preview ABIs. The resulting `.it` APK contains the JS bundle and uses the template development certificate for local preview. The preview requires an approved HTTPS origin to connect. The local loopback workflow therefore uses the development profile above. A production signing key or wider distribution needs a reviewed release identity and channel. [Android signing](https://developer.android.com/studio/publish/app-signing)

To verify a new APK, use `apksigner verify --verbose --print-certs`, `aapt dump badging`, `aapt dump xmltree` and `Get-FileHash -Algorithm SHA256`. Install the exact verified bytes on the named AVD and cold-launch with Metro stopped. Keep artifacts under `.local/artifacts/` with a checksum. Compare clean builds and rehearse upgrade with a matching signature before operational release.

## iOS and shutdown

`npm.cmd run bundle:ios` exports its JS bundle on Windows. On a compatible Mac, use `npm ci` and `npm exec -- expo run:ios` for the native simulator target. Verify app identity, device permissions and signing independently. [Expo local builds](https://docs.expo.dev/guides/local-app-development/)

Stop the API and Metro in their own terminals, remove only the OrderFlow ADB mappings, and use `tools/local-db.ps1 -PgBin <path> -Stop` for the dedicated PostgreSQL cluster. Preserve the cluster and configuration for data retention. Keep private backups with the owner and verify a separate restore with current schema, row counts and audit relationships before using important records.

[Release evidence](RELEASE-EVIDENCE.md) ? [Device matrix](DEVICE-COMPATIBILITY.md)
