# Cutting a signed, notarized BetterX macOS release (arm64)

One-time setup on the build Mac:
1. Xcode → Settings → Accounts → sign in the Apple ID that owns team FX4926673K, then
   Manage Certificates → + → Developer ID Application.
2. Store notary credentials once (app-specific password from appleid.apple.com):
   `xcrun notarytool store-credentials betterx-notary --apple-id <apple id> --team-id FX4926673K`

Per release:
1. `bun run --cwd packages/desktop build`
2. Start from the previous release bundle, replace `Contents/Resources/app.asar`
   (repack `dist/`, `assets/`, `node_modules/`, `package.json` with `@electron/asar`) and
   `Contents/Resources/mcp/index.cjs`, bump `CFBundleShortVersionString`/`CFBundleVersion`.
3. `IDENTITY="Developer ID Application: Rut Mehta (FX4926673K)" PROFILE=betterx-notary scripts/sign-notarize-electron.sh`
   (run from a directory containing the .app plus the extracted entitlement plists).
4. `gh release create vX.Y.Z --prerelease --title ... "BetterX V3 Desktop-X.Y.Z-arm64.dmg"`
