# Native release evidence

**November 26–27, 2026 · Windows local IT**

| Check | Observed result |
| --- | --- |
| Toolchain | Node 24.15.0, npm 11.12.1, JDK 17.0.19, Gradle 9.4.1, Android SDK/build-tools 37, CMake 3.31.6 and NDK 27.1.12297006. Expo 58 and React Native 0.88.1. |
| Android development APK | `:app:assembleDebug -PreactNativeArchitectures=x86_64` passed. `com.orderflowmobile.app.dev` installed on `OrderFlow_IT_API35`. ADB reverse mapped only the OrderFlow API and Metro. |
| Connected development path | Signed in, opened the site, entered a manual release, recovered the committed receipt after timeout, claimed work, saved a pick draft, force-stopped, reauthenticated as the same user, restored the draft and submitted a one-unit pick. The API confirmed `picking` at revision 3. [Android screenshot](evidence/orderflow-picked.png) |
| Android standalone preview | `:app:assembleRelease` passed for x86_64 and for ARM64 plus x86_64. Installed the final dual-ABI artifact through an isolated ADB server. On November 27, it cold-launched to the native sign-in screen with Metro stopped and port 5762 free. The SHA-256 read from Android's installed APK matched the staged artifact. |
| Package inspection | `com.orderflowmobile.app.it`, versionName `0.1.0`, versionCode `1`, ARM64 and x86_64, minSdk 24, targetSdk 36. Embedded Hermes bundle. V2 development signature verified. Main manifest has backup and cleartext disabled with backup/transfer exclusion resources. |
| Focused Android accessibility and permission checks | The standalone sign-in action remained reachable at approximately 320 dp with dark mode and font scale 2.0. Denying camera permission kept manual barcode input available on the connected development build. |
| iOS | `npm.cmd run bundle:ios` passed. Native build, signing, simulator and hardware checks require Xcode on a compatible Mac. |
| Hardware, upgrade and distribution | Physical ARM64 Android, camera/wedge hardware, VoiceOver/TalkBack, owner signing, approved HTTPS, same-input clean build comparison and previous-version upgrade remain unverified. |

## Local artifact

- [OrderFlow-0.1.0-it-android.apk](../.local/artifacts/OrderFlow-0.1.0-it-android.apk)
- [SHA-256 file](../.local/artifacts/OrderFlow-0.1.0-it-android.apk.sha256)
- SHA-256 `a2055c3784e39c3b765b8026365c174f22e8cca3073d35e1967929edf75f13c4`
- V2 development certificate SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`

This is a local emulator preview. The development profile exercises the isolated HTTP API over ADB reverse. The standalone profile uses an authorized HTTPS origin when configured. The cold-launch proof covers installation and rendering with its embedded bundle.

[Build and install steps](07-MOBILE-BUILD-AND-RELEASE.md) · [Device matrix](DEVICE-COMPATIBILITY.md)
