# FlexFund Kids (iOS)

SwiftUI iPhone app for kids — the "Bootstrap Mobile App" spec. iOS 17+, built from
standard iOS components with the Prototype B brand (pink/purple, Bangers headlines,
dog mascot). Talks to the Family Account API (`../server`, contract in `../docs/API.md`).

## Run

```sh
# 1. API (from the repo root)
npm run dev:server                     # http://localhost:8787/api/v1

# 2. App
cd ios
xcodegen generate                      # regenerate FlexFundKids.xcodeproj after editing project.yml
open FlexFundKids.xcodeproj            # run the FlexFundKids scheme on an iPhone simulator
```

Connect the app: in the Family Dashboard choose a child → **Connect a device**, then
type the 6-character code in the app (or open `flexfundkids://pair?code=XXXXXX`
in the simulator: `xcrun simctl openurl booted "flexfundkids://pair?code=XXXXXX"`).

API address: defaults to `http://localhost:8787/api/v1`. Override with the
`FLEXFUND_API_URL` environment variable / launch argument, or (Debug builds) the
server button on the Welcome screen — on a physical iPhone use your Mac's LAN address.

### Emoji in the iOS 26 simulator

Xcode's iOS 26.x simulator runtimes have a font-catalog bug: the system emoji font points
at `Fonts/Core/AppleColorEmoji.ttc`, which those runtimes don't ship, so emoji render as
`?` boxes in every app (Safari too). `Core/EmojiFallback.swift` works around it in
**simulator builds only** by loading the emoji font the runtime *does* ship
(`Fonts/CoreAddition/AppleColorEmoji-160px.ttc`) and adding it to the fallback list of the
fonts used for emoji (`Font.emoji(size:)`, `Font.withEmoji(_:)`). On devices and healthy
simulators those helpers return the normal system fonts. `EmojiRenderingTests` guards it.

## Test

```sh
cd server && PORT=8789 DATABASE_PATH=/tmp/ff-ios.db npm start   # dedicated test API
cd ios
TEST_RUNNER_FLEXFUND_API_URL=http://localhost:8789/api/v1 \
  xcodebuild -project FlexFundKids.xcodeproj -scheme FlexFundKids \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test
```

- `FlexFundKidsTests` — decoding (incl. unknown-enum tolerance), money formatting, grouping.
- `FlexFundKidsUITests` — the full kid journey against the live API. The test creates its
  own family with sample data and a pairing code, then: pairs, creates a PIN, marks a
  challenge done, opens a pot, reports a transaction, passes a lesson quiz, sends money to
  a friend, opens the profile, locks, fails and then succeeds a PIN unlock, and finally
  checks the parent's approval queue. Screenshots are attached to the `.xcresult`
  (`xcrun xcresulttool export attachments --path <result> --output-path <dir>`).

## Structure

```
FlexFundKids/
  App/          AppModel (pairing, PIN lock, Face ID, phases), KidData (tab data), app entry + tabs
  Core/         APIClient (async/await), Keychain + biometrics, formatting, config
  Models/       Codable mirrors of docs/API.md
  Components/   Brand theme, Keypad, Purchase Card, transaction rows/detail
  Features/     Onboarding, Lock, Savings, Wallet, Learn, Friends, Profile
  Resources/    Assets (icon, mascot, colors), Bangers font (OFL)
scripts/make-app-icon.swift   regenerates the app icon from ../assets/brand/dog.png
```

Security: the device token lives in the Keychain (this-device-only); the PIN-unlocked kid
session token is memory-only; Face ID stores the PIN behind `biometryCurrentSet`. The app
auto-locks after 5 minutes in the background.

Known simulator issue: on this machine's iOS 26.3 simulator runtime, emoji render as "?"
boxes in every app (Safari included). Emoji display normally on devices; the app's own
chrome uses SF Symbols, while avatars/pot icons are emoji chosen by parents.
