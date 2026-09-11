#!/usr/bin/env bash
# Sign inside-out with Developer ID, notarize, staple, and build a DMG.
# Usage: IDENTITY="Developer ID Application: Rut Mehta (TEAMID)" PROFILE=betterx-notary ./sign-notarize.sh
set -euo pipefail
cd "$(dirname "$0")"
APP="BetterX V3 Desktop.app"; VER=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")
: "${IDENTITY:?}" "${PROFILE:?}"
sign() { codesign --force --options runtime --timestamp --sign "$IDENTITY" "$@"; }
FW="$APP/Contents/Frameworks"
# Electron framework internals first, then helpers, then the app.
find "$FW/Electron Framework.framework/Versions/A/Libraries" -name '*.dylib' -print0 | xargs -0 -n1 codesign --force --options runtime --timestamp --sign "$IDENTITY"
for h in "$FW/Electron Framework.framework/Versions/A/Helpers/"*; do sign "$h"; done
sign "$FW/Electron Framework.framework/Versions/A/Electron Framework"
sign "$FW/Electron Framework.framework"
for f in Mantle ReactiveObjC Squirrel; do sign "$FW/$f.framework"; done
sign --entitlements ent-BetterX_V3_Desktop_Helper__GPU_.plist "$FW/BetterX V3 Desktop Helper (GPU).app"
sign --entitlements ent-BetterX_V3_Desktop_Helper__Plugin_.plist "$FW/BetterX V3 Desktop Helper (Plugin).app"
sign --entitlements ent-BetterX_V3_Desktop_Helper__Renderer_.plist "$FW/BetterX V3 Desktop Helper (Renderer).app"
sign --entitlements ent-BetterX_V3_Desktop_Helper.plist "$FW/BetterX V3 Desktop Helper.app"
sign --entitlements entitlements.plist "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
ditto -c -k --keepParent "$APP" app.zip
xcrun notarytool submit app.zip --keychain-profile "$PROFILE" --wait
xcrun stapler staple "$APP"
DMG="BetterX V3 Desktop-$VER-arm64.dmg"; rm -rf dmgroot "$DMG"; mkdir dmgroot; ditto "$APP" "dmgroot/$APP"; ln -s /Applications dmgroot/Applications
hdiutil create -volname "BetterX V3 Desktop $VER-arm64" -srcfolder dmgroot -ov -format UDZO "$DMG"
codesign --force --timestamp --sign "$IDENTITY" "$DMG"
xcrun notarytool submit "$DMG" --keychain-profile "$PROFILE" --wait
xcrun stapler staple "$DMG"; xcrun stapler validate "$DMG"
spctl --assess --type open --context context:primary-signature -v "$DMG"; spctl --assess --type execute -v "$APP"
shasum -a 256 "$DMG"
