---
name: EAS iOS pod modular-headers failure
description: How to fix CocoaPods INSTALL_PODS failures where a Swift pod's deps "do not define modules" in an Expo managed EAS build
---

# EAS iOS INSTALL_PODS — "do not define modules" (modular headers)

When an EAS iOS production build fails at INSTALL_PODS with e.g.
`The Swift pod 'AppCheckCore' depends upon 'GoogleUtilities' and 'RecaptchaInterop', which do not define modules`,
the offending pods need module maps (`:modular_headers => true`). In this app the chain is
`@clerk/expo -> ClerkGoogleSignIn -> GoogleSignIn -> AppCheckCore`.

**Fix (managed workflow):** add the `expo-build-properties` config plugin and list the named pods
under `ios.extraPods` with `modular_headers: true` (NOT a top-level `useModularHeaders` — that key
does not exist in expo-build-properties v1.0.x; valid ios keys are `useFrameworks`, `extraPods`,
`deploymentTarget`, etc.).

**Why this works (verified):** the plugin only writes `apple.extraPods` into
`ios/Podfile.properties.json`; it does NOT inject pod lines into the Podfile text. Expo's
`expo-modules-autolinking` Ruby (`scripts/ios/autolinking_manager.rb`) reads those extra
dependencies and applies `options[:modular_headers]` per pod at pod-install time. So the only way to
confirm locally is `expo prebuild --platform ios --no-install` then inspect
`ios/Podfile.properties.json` (the Podfile itself stays clean).

**Why not alternatives:** global `use_modular_headers!` is broader than needed; `useFrameworks:'static'`
is not the direct fix and risks New-Arch/precompiled-RN side effects. Prefer the minimal extraPods list;
if a later build names another pod, add only that one.

**How to apply / gotchas:**
- This is a managed Expo app — do NOT commit `ios/`/`android/`. After any local `expo prebuild` used
  for inspection, delete the generated `ios/`+`android/` dirs.
- `expo prebuild` also mutates `package.json` (adds `android`/`ios` scripts, duplicates
  `expo`/`react`/`react-native` into `dependencies`). Revert those; keep only intended deps.
- extraPods without a version pin follows the existing dependency graph — pinning a version is more
  likely to cause conflicts, not less.
