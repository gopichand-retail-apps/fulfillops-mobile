# Device compatibility

| Target | Local evidence |
| --- | --- |
| Android emulator | `OrderFlow_IT_API35`, Pixel 6 profile, Android 15/API 35 and x86_64. Connected debug sign-in, release, claim, draft/relaunch, manual pick and standalone APK cold launch observed. APK minSdk 24, targetSdk 36, compile SDK 37. |
| Physical Android phone | ARM64 binaries are included in the standalone preview. Authorized device installation and workflow checks are pending. Verify camera, lock, low memory, network interruptions and upgrade retention. |
| Rugged handheld | Keyboard-wedge suffix, leading zeros, focus, fast repeat, 1D/2D support and vendor integration need measured testing on named hardware. Manual input is available. |
| Tablets | Native layout uses scalable single-column surfaces with a bounded reading width. Tablet, orientation and split-pane layout remain unverified. |
| iPhone and iPad | iOS bundle export passed. Native target is iOS/iPadOS 16.4+ under Expo SDK 58. Native build, simulator, signing and VoiceOver require a Mac with Xcode 26.4+ and eligible hardware. |

Record device, OS/API, architecture, resolution/scale, orientation, app ID and build hash, scanner type, permissions and network. Confirm reduced motion, both themes, keyboard, large-text and shared-device behavior in packaged builds. [Expo SDK 58 compatibility](https://docs.expo.dev/versions/v58.0.0/) · [Expo Camera](https://docs.expo.dev/versions/v58.0.0/sdk/camera/)
