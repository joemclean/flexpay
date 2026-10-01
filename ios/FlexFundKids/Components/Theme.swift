import SwiftUI
import UIKit

/// Prototype B brand, applied as accents on top of standard system surfaces.
enum Brand {
    static let pink = Color("BrandPink")
    static let purple = Color("BrandPurple")
    static let accent = Color("BrandAccent")
    static let yellow = Color("BrandYellow")
    static let gradientStart = Color("GradientStart")
    static let gradientEnd = Color("GradientEnd")

    /// The pink → purple hero gradient (welcome, lock screen, balance hero).
    static var gradient: LinearGradient {
        LinearGradient(colors: [gradientStart, Color(red: 0.84, green: 0.34, blue: 0.69), gradientEnd],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    /// Slightly deepened gradient so white text keeps comfortable contrast.
    static var heroBackground: some View {
        ZStack {
            gradient
            LinearGradient(colors: [.black.opacity(0.05), .black.opacity(0.28)], startPoint: .top, endPoint: .bottom)
        }
    }

    static let cardGradient = LinearGradient(
        colors: [Color(red: 0.34, green: 0.11, blue: 0.44), Color(red: 0.53, green: 0.23, blue: 0.56)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    static let headlineFontName = "Bangers-Regular"

    /// Bangers for brand moments; scales with Dynamic Type relative to `style`.
    static func headline(_ size: CGFloat, relativeTo style: Font.TextStyle = .largeTitle) -> Font {
        .custom(headlineFontName, size: size, relativeTo: style)
    }

    /// Bangers large navigation titles in brand purple; everything else stays system.
    static func configureAppearance() {
        let base = UIFont(name: headlineFontName, size: 38) ?? .systemFont(ofSize: 34, weight: .bold)
        let scaled = UIFontMetrics(forTextStyle: .largeTitle).scaledFont(for: base)
        let color = UIColor(named: "BrandPurple") ?? .label
        UINavigationBar.appearance().largeTitleTextAttributes = [.font: scaled, .foregroundColor: color]
    }
}

extension Text {
    /// A Bangers title. The font is slanted, so a trailing hair space keeps the
    /// last glyph from being clipped by the text's bounds.
    init(headline string: String) {
        self = Text(verbatim: string + "\u{2009}").accessibilityLabel(Text(verbatim: string))
    }
}

/// Emoji in a tinted circle (avatars, pots, challenges).
struct EmojiBadge: View {
    let emoji: String
    var size: CGFloat = 44
    var tint: Color = Brand.pink

    var body: some View {
        Text(emoji)
            .font(.system(size: size * 0.52))
            .frame(width: size, height: size)
            .background(tint.opacity(0.14), in: Circle())
            .accessibilityHidden(true)
    }
}

/// SF Symbol in a tinted circle (transaction categories).
struct SymbolBadge: View {
    let symbol: String
    let tint: Color
    var size: CGFloat = 40

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: size, height: size)
            .background(tint.opacity(0.15), in: Circle())
            .accessibilityHidden(true)
    }
}

/// Small capsule label used for statuses ("Waiting", "Parent").
struct StatusBadge: View {
    let text: String
    var symbol: String?
    var tint: Color = .secondary

    var body: some View {
        Label {
            Text(text)
        } icon: {
            if let symbol { Image(systemName: symbol) }
        }
        .labelStyle(.titleAndIcon)
        .font(.caption.weight(.semibold))
        .foregroundStyle(tint)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(tint.opacity(0.12), in: Capsule())
    }
}

/// Toolbar button showing the kid's avatar; opens the profile sheet.
struct ProfileToolbarButton: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        Button {
            app.showProfile = true
        } label: {
            Text(app.child?.avatar ?? "🙂")
                .font(.title3)
                .frame(width: 36, height: 36)
                .background(Brand.pink.opacity(0.15), in: Circle())
        }
        .accessibilityLabel("Your profile")
        .accessibilityIdentifier("profileButton")
    }
}

/// Horizontal shake used when a PIN is wrong.
struct ShakeEffect: GeometryEffect {
    var travel: CGFloat = 10
    var shakes: CGFloat = 3
    var animatableData: CGFloat

    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: travel * sin(animatableData * .pi * shakes), y: 0))
    }
}

extension View {
    /// Standard “something went wrong” banner row content.
    func errorBanner(_ message: String?) -> some View {
        overlay(alignment: .top) {
            if let message {
                Label(message, systemImage: "wifi.exclamationmark")
                    .font(.footnote.weight(.medium))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(.regularMaterial, in: Capsule())
                    .padding(.top, 4)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }
}
