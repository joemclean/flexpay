import CoreText
import SwiftUI
import UIKit

/// Workaround for a bug in Xcode's iOS 26.x simulator runtimes.
///
/// The runtime's font catalog points the system emoji font at
/// `Fonts/Core/AppleColorEmoji.ttc`, a file those runtimes don't ship, so every emoji
/// renders as the "?" LastResort glyph — in every app, Safari included. The emoji font *is*
/// shipped at `Fonts/CoreAddition/AppleColorEmoji-160px.ttc`, but it can't be registered
/// under its own name (CoreText error 305, duplicate name) and the broken catalog entry
/// can't be unregistered (error 201).
///
/// So, only when running in a simulator with that broken entry, we load the shipped file
/// directly and put it first in the fallback (cascade) list of the fonts we draw emoji with.
/// On devices and healthy simulators `descriptor` is nil and the helpers below return the
/// ordinary system fonts — no behavior change.
enum EmojiFallback {
    static let descriptor: CTFontDescriptor? = {
        #if targetEnvironment(simulator)
        let probe = CTFontCreateWithName("AppleColorEmoji" as CFString, 12, nil)
        guard let url = CTFontCopyAttribute(probe, kCTFontURLAttribute) as? URL,
              !FileManager.default.fileExists(atPath: url.path) else { return nil } // system emoji works
        let shipped = url.deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("CoreAddition/AppleColorEmoji-160px.ttc")
        guard let data = try? Data(contentsOf: shipped, options: .mappedIfSafe),
              let descriptors = CTFontManagerCreateFontDescriptorsFromData(data as CFData) as? [CTFontDescriptor]
        else { return nil }
        return descriptors.first
        #else
        return nil
        #endif
    }()

    /// `font` with the emoji fallback added to its cascade list.
    static func cascading(_ font: UIFont) -> Font {
        guard let descriptor else { return Font(font) }
        let base = CTFontCopyFontDescriptor(font as CTFont)
        let withEmoji = CTFontDescriptorCreateCopyWithAttributes(
            base, [kCTFontCascadeListAttribute: [descriptor]] as CFDictionary
        )
        return Font(CTFontCreateWithFontDescriptor(withEmoji, font.pointSize, nil))
    }
}

extension Font {
    /// For a standalone emoji glyph (avatars, pot and challenge icons).
    static func emoji(size: CGFloat) -> Font {
        guard let descriptor = EmojiFallback.descriptor else { return .system(size: size) }
        return Font(CTFontCreateWithFontDescriptor(descriptor, size, nil))
    }

    /// A Dynamic Type text style for text that may contain emoji (notes, titles).
    /// Identical to `.system(style, weight:)` outside the broken simulator runtime.
    static func withEmoji(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        guard EmojiFallback.descriptor != nil else { return .system(style, weight: weight) }
        let base = UIFont.preferredFont(forTextStyle: style.uiTextStyle)
        let weighted = UIFont.systemFont(ofSize: base.pointSize, weight: weight.uiWeight)
        return EmojiFallback.cascading(weighted)
    }
}

private extension Font.TextStyle {
    var uiTextStyle: UIFont.TextStyle {
        switch self {
        case .largeTitle: .largeTitle
        case .title: .title1
        case .title2: .title2
        case .title3: .title3
        case .headline: .headline
        case .subheadline: .subheadline
        case .callout: .callout
        case .footnote: .footnote
        case .caption: .caption1
        case .caption2: .caption2
        default: .body
        }
    }
}

private extension Font.Weight {
    var uiWeight: UIFont.Weight {
        switch self {
        case .ultraLight: .ultraLight
        case .thin: .thin
        case .light: .light
        case .medium: .medium
        case .semibold: .semibold
        case .bold: .bold
        case .heavy: .heavy
        case .black: .black
        default: .regular
        }
    }
}
