import Foundation
import SwiftUI

enum Money {
    private static let formatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.locale = Locale(identifier: "en_US")
        return f
    }()

    /// "$12.50"
    static func format(_ cents: Int) -> String {
        formatter.string(from: NSDecimalNumber(value: Double(cents) / 100)) ?? "$\(cents / 100)"
    }

    /// "+$2.00" / "−$4.50"
    static func signed(_ cents: Int) -> String {
        if cents > 0 { return "+" + format(cents) }
        if cents < 0 { return "−" + format(-cents) }
        return format(0)
    }

    /// Spoken form for VoiceOver, e.g. "12 dollars and 50 cents".
    static func spoken(_ cents: Int) -> String {
        let f = NumberFormatter()
        f.numberStyle = .currencyPlural
        f.locale = Locale(identifier: "en_US")
        return f.string(from: NSDecimalNumber(value: Double(abs(cents)) / 100)) ?? format(cents)
    }
}

enum DayFormat {
    /// Section title for grouping: "Today", "Yesterday", "Monday", "Sep 12".
    static func sectionTitle(for date: Date, now: Date = .now) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        if let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: now)).day,
           days < 7 {
            return date.formatted(.dateTime.weekday(.wide))
        }
        return date.formatted(.dateTime.month(.abbreviated).day())
    }

    /// "1d ago"-style short relative time, like the prototype.
    static func relative(_ date: Date) -> String {
        date.formatted(.relative(presentation: .named, unitsStyle: .abbreviated))
    }
}

extension Transaction {
    /// SF Symbol for the row icon.
    var symbol: String {
        switch kind {
        case .allowance: return "calendar.badge.clock"
        case .reward: return "star.fill"
        case .lessonReward: return "graduationcap.fill"
        case .deposit: return "gift.fill"
        case .transfer: return "arrow.left.arrow.right"
        case .fee: return "exclamationmark.circle.fill"
        case .p2pSent: return "paperplane.fill"
        case .p2pReceived: return "arrow.down.circle.fill"
        case .cardPurchase, .unknown: return category.symbol
        }
    }

    var tint: Color {
        switch kind {
        case .allowance, .p2pReceived: return .green
        case .reward: return .orange
        case .lessonReward: return .indigo
        case .deposit: return .pink
        case .fee: return .red
        case .p2pSent: return .blue
        case .transfer: return .gray
        case .cardPurchase, .unknown: return category.tint
        }
    }

    var kindLabel: String {
        switch kind {
        case .allowance: return "Allowance"
        case .reward: return "Challenge reward"
        case .lessonReward: return "Lesson reward"
        case .deposit: return "Money added"
        case .transfer: return "Moved between pots"
        case .fee: return "Fee"
        case .p2pSent: return "Sent to a friend"
        case .p2pReceived: return "Money received"
        case .cardPurchase: return "Card payment"
        case .unknown: return "Activity"
        }
    }

    var declineMessage: String? {
        guard isDeclined else { return nil }
        switch declineReason {
        case "card_frozen": return "Declined — card is frozen"
        case "insufficient_funds": return "Declined — not enough money"
        case "daily_limit": return "Declined — daily limit reached"
        default: return "Declined"
        }
    }
}

extension TransactionCategory {
    var symbol: String {
        switch self {
        case .food: "fork.knife"
        case .transport: "bus.fill"
        case .entertainment: "ticket.fill"
        case .shopping: "bag.fill"
        case .games: "gamecontroller.fill"
        case .education: "book.fill"
        case .gifts: "gift.fill"
        case .fees: "exclamationmark.circle.fill"
        case .income: "arrow.down.circle.fill"
        case .savings: "banknote.fill"
        case .other: "square.grid.2x2.fill"
        }
    }

    var tint: Color {
        switch self {
        case .food: .orange
        case .transport: .blue
        case .entertainment: .purple
        case .shopping: .pink
        case .games: .indigo
        case .education: .teal
        case .gifts: .mint
        case .fees: .red
        case .income: .green
        case .savings: .cyan
        case .other: .gray
        }
    }

    var label: String { rawValue.capitalized }
}
