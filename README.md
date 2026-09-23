# TailWind (mobile)

Bare React Native 0.86 app (no Expo). Bundle / application id: `com.tailwind.app`.

```sh
npm install
cd ios && pod install && cd ..

npm start            # Metro
npm run ios          # iOS simulator (boot one first: xcrun simctl boot <udid>)
npm run android      # emulator or connected device
```

- Navigation: React Navigation (`src/navigation`), screens in `src/screens`.
- Fonts live in `assets/fonts` (named by PostScript name); after adding one, run `npx react-native-asset`.
- `patches/` holds a patch-package fix so `run-ios` works on Xcode 27 (no standalone Simulator.app).
