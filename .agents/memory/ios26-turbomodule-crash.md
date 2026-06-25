---
name: iOS 26 TurboModule launch crash (RNSTabBarController)
description: Why the Expo mobile app crashed on launch during Apple review on iOS 26, and the applied fix.
---

# iOS 26 起動クラッシュ — react-native-screens RNSTabBarController

App Store 審査で Guideline 2.1(a) 連続リジェクト。実機 iOS 26 のリリース/TestFlight ビルドのみ、起動直後に `SIGABRT` (`abort()`)、faulting queue `com.meta.react.turbomodulemanager.queue`。実クラッシュログのフレームに `-[RNSTabBarController updateTabBarAppearance]` が出る。

**根本原因:** iOS 26 + RN New Architecture の既知バグ。TurboModule の void メソッドが NSException を投げ、GCD キュー上で未捕捉になり terminate。JS 実行前に落ちるので JS 側 try/catch は無効。react-native-screens はどのバージョン(4.16/4.22/4.23)でも再発し、修正版リリースは無い (facebook/react-native#54859, #53960)。

**適用した修正:** `artifacts/mobile/app/_layout.tsx` のモジュールスコープ先頭で `enableScreens(false)`。ネイティブタブバーコントローラを使わなくなり回避。expo-router ナビ/モーダル/reanimated 4/web に実害なし。`newArchEnabled: true` は維持 (reanimated 4 が必須)。

**Why:** デバッグビルド・シミュレータでは再現しないため、ローカル検証では絶対に捕まえられない。リリース binary + iOS 26 実機/TestFlight でしか確認できない。

**How to apply / 落とし穴:**
- クラッシュログは毎回 `build_version` を確認。同じビルドを再提出しても必ず同じクラッシュ。コード修正は **新しい EAS ビルドを作って初めて効く**。
- `eas.json` は `appVersionSource: "remote"` + production `autoIncrement: true`。よって `app.json` の `ios.buildNumber` は提出ビルド番号に**効かない** (EAS リモートが採番)。
- 修正後の手順: `eas build --platform ios --profile production` → TestFlight で iOS 26 実機を cold launch + タブ切替 + モーダル + サインイン smoke test → `eas submit`。
- 再発時は react-native-screens の `updateTabBarAppearance` を patch-package で @try/@catch、または SDK/RN アップグレード。
