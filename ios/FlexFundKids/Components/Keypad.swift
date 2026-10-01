import SwiftUI

/// Large numeric keypad built from standard Buttons (≥ 72pt targets).
/// Used for the PIN and for entering amounts.
struct Keypad: View {
    enum Key: Hashable {
        case digit(Int)
        case decimal
        case delete
        case biometric
    }

    enum Style { case onHero, standard }

    var leftKey: Key? = nil
    var style: Style = .standard
    var onKey: (Key) -> Void

    private let rows: [[Key?]] = [
        [.digit(1), .digit(2), .digit(3)],
        [.digit(4), .digit(5), .digit(6)],
        [.digit(7), .digit(8), .digit(9)],
    ]

    var body: some View {
        Grid(horizontalSpacing: 22, verticalSpacing: 14) {
            ForEach(0..<rows.count, id: \.self) { row in
                GridRow {
                    ForEach(rows[row], id: \.self) { key in
                        if let key { button(key) }
                    }
                }
            }
            GridRow {
                if let leftKey { button(leftKey) } else { Color.clear.frame(width: 76, height: 76) }
                button(.digit(0))
                button(.delete)
            }
        }
        .sensoryFeedback(.selection, trigger: tapCount)
    }

    @State private var tapCount = 0

    @ViewBuilder
    private func button(_ key: Key) -> some View {
        Button {
            tapCount += 1
            onKey(key)
        } label: {
            label(for: key)
                .frame(width: 76, height: 76)
                .contentShape(Circle())
        }
        .buttonStyle(KeypadButtonStyle(style: style, isDigit: isDigit(key)))
        .accessibilityLabel(accessibilityLabel(for: key))
        .accessibilityIdentifier(identifier(for: key))
    }

    @ViewBuilder
    private func label(for key: Key) -> some View {
        switch key {
        case .digit(let n): Text("\(n)").font(.system(size: 32, weight: .semibold, design: .rounded))
        case .decimal: Text(".").font(.system(size: 34, weight: .bold, design: .rounded))
        case .delete: Image(systemName: "delete.left").font(.system(size: 24, weight: .semibold))
        case .biometric: Image(systemName: Biometrics.symbol).font(.system(size: 28, weight: .regular))
        }
    }

    private func isDigit(_ key: Key) -> Bool {
        if case .digit = key { return true }
        if case .decimal = key { return true }
        return false
    }

    private func accessibilityLabel(for key: Key) -> String {
        switch key {
        case .digit(let n): "\(n)"
        case .decimal: "Decimal point"
        case .delete: "Delete"
        case .biometric: "Unlock with \(Biometrics.name)"
        }
    }

    private func identifier(for key: Key) -> String {
        switch key {
        case .digit(let n): "key_\(n)"
        case .decimal: "key_decimal"
        case .delete: "key_delete"
        case .biometric: "key_biometric"
        }
    }
}

private struct KeypadButtonStyle: ButtonStyle {
    let style: Keypad.Style
    let isDigit: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(style == .onHero ? Color.white : Color.primary)
            .background {
                if isDigit {
                    Circle().fill(fill(pressed: configuration.isPressed))
                }
            }
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }

    private func fill(pressed: Bool) -> AnyShapeStyle {
        switch style {
        case .onHero: AnyShapeStyle(Color.white.opacity(pressed ? 0.38 : 0.2))
        case .standard: AnyShapeStyle(Color(.secondarySystemFill).opacity(pressed ? 1 : 0.7))
        }
    }
}

/// Four PIN dots.
struct PinDots: View {
    let filled: Int
    var count = 4
    var color: Color = .white

    var body: some View {
        HStack(spacing: 18) {
            ForEach(0..<count, id: \.self) { index in
                Circle()
                    .strokeBorder(color, lineWidth: 2)
                    .background(Circle().fill(index < filled ? color : .clear))
                    .frame(width: 18, height: 18)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("\(filled) of \(count) digits entered")
    }
}
