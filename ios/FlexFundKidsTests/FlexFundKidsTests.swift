import CoreText
import UIKit
import XCTest
@testable import FlexFundKids

final class FormattingTests: XCTestCase {
    func testMoneyFormatting() {
        XCTAssertEqual(Money.format(1250), "$12.50")
        XCTAssertEqual(Money.format(0), "$0.00")
        XCTAssertEqual(Money.signed(200), "+$2.00")
        XCTAssertEqual(Money.signed(-450), "−$4.50")
    }

    func testGroupingByDayKeepsOrderAndSplitsDays() throws {
        let now = Date()
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: now)!
        let items = [
            makeTransaction(id: "a", date: now),
            makeTransaction(id: "b", date: now.addingTimeInterval(-60)),
            makeTransaction(id: "c", date: yesterday),
        ]
        let groups = groupedByDay(items)
        XCTAssertEqual(groups.map(\.title), ["Today", "Yesterday"])
        XCTAssertEqual(groups[0].items.map(\.id), ["a", "b"])
    }

    private func makeTransaction(id: String, date: Date) -> Transaction {
        Transaction(id: id, childId: "c", potId: nil, potName: nil, amountCents: -100, kind: .cardPurchase,
                    status: .posted, title: "Deli", category: .food, counterparty: nil, memo: nil,
                    declineReason: nil, createdAt: date)
    }
}

final class DecodingTests: XCTestCase {
    private let decoder = APIClient.makeDecoder()

    func testDecodesKidHomeAndToleratesUnknownEnums() throws {
        let json = """
        {
          "child": { "id": "chd_1", "name": "Finn", "avatar": "🐶", "hasPin": true },
          "totalCents": 35560, "spendingCents": 3560, "savedCents": 32000, "streakWeeks": 3,
          "pots": [{ "id": "pot_1", "childId": "chd_1", "name": "New Bike", "emoji": "🚲", "goalCents": 25000,
                     "balanceCents": 18000, "isSpending": false, "progress": 0.72, "goalReached": false,
                     "sortOrder": 1, "createdAt": "2026-07-29T13:00:00.000Z" }],
          "challenges": [{ "id": "chl_1", "childId": "chd_1", "title": "Tidy bedroom", "emoji": "🧹",
                           "rewardCents": 200, "recurrence": "fortnightly", "potId": null, "active": true,
                           "status": "pending", "createdAt": "2026-08-01T13:00:00Z" }],
          "pendingRequests": 1,
          "card": { "id": "crd_1", "childId": "chd_1", "name": "Purchase Card", "last4": "6790", "status": "frozen",
                    "dailyLimitCents": 2500, "createdAt": "2026-07-29T13:00:00.000Z", "spentTodayCents": 1000,
                    "remainingTodayCents": 1500 }
        }
        """
        let home = try decoder.decode(Home.self, from: Data(json.utf8))
        XCTAssertEqual(home.child.name, "Finn")
        XCTAssertEqual(home.pots.first?.remainingCents, 7000)
        XCTAssertEqual(home.challenges.first?.recurrence, .once, "unknown values fall back instead of failing")
        XCTAssertEqual(home.challenges.first?.status, .pending)
        XCTAssertTrue(home.card.isFrozen)
    }

    func testDecodesTransactionWithReport() throws {
        let json = """
        { "id": "txn_1", "childId": "chd_1", "potId": "pot_1", "potName": "General", "amountCents": -1000,
          "kind": "card_purchase", "status": "declined", "title": "Gameshop", "category": "games",
          "counterparty": null, "memo": null, "declineReason": "daily_limit", "createdAt": "2026-10-01T10:00:00.000Z",
          "report": { "id": "rep_1", "transactionId": "txn_1", "childId": "chd_1", "reason": "dont_recognize",
                      "reasonLabel": "I don’t recognize this", "note": null, "status": "open",
                      "createdAt": "2026-10-01T11:00:00.000Z", "resolvedAt": null, "resolution": null } }
        """
        let detail = try decoder.decode(TransactionWithReport.self, from: Data(json.utf8))
        XCTAssertTrue(detail.transaction.isDeclined)
        XCTAssertEqual(detail.transaction.declineMessage, "Declined — daily limit reached")
        XCTAssertEqual(detail.report?.status, .open)
        XCTAssertEqual(detail.report?.reason, .dontRecognize)
    }

    func testUnlinkRequestOmitsMissingCode() throws {
        let data = try JSONEncoder().encode(UnlinkRequest(email: "a@b.co", password: "x"))
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        XCTAssertNil(object?["code"])
    }
}

/// Guards the iOS 26 simulator emoji workaround (see EmojiFallback): whatever runtime the
/// tests run on, the font the app draws emoji with must produce a colored glyph, not the
/// black "?" LastResort box.
final class EmojiRenderingTests: XCTestCase {
    func testEmojiFontDrawsColorGlyphs() {
        let font: CTFont = EmojiFallback.descriptor.map { CTFontCreateWithFontDescriptor($0, 40, nil) }
            ?? CTFontCreateUIFontForLanguage(.system, 40, nil)!
        for emoji in ["🐶", "🚲", "💰"] {
            XCTAssertGreaterThan(coloredPixels(emoji, font: font), 50, "\(emoji) did not render in color")
        }
    }

    func testTextStyleFontFallsBackToEmoji() {
        let base = UIFont.preferredFont(forTextStyle: .body) as CTFont
        let font: CTFont = EmojiFallback.descriptor.map { emoji in
            let descriptor = CTFontDescriptorCreateCopyWithAttributes(
                CTFontCopyFontDescriptor(base), [kCTFontCascadeListAttribute: [emoji]] as CFDictionary
            )
            return CTFontCreateWithFontDescriptor(descriptor, 40, nil)
        } ?? CTFontCreateUIFontForLanguage(.system, 40, nil)!
        XCTAssertGreaterThan(coloredPixels("🍕", font: font), 50)
    }

    private func coloredPixels(_ string: String, font: CTFont) -> Int {
        let attributed = NSAttributedString(string: string, attributes: [.init(kCTFontAttributeName as String): font])
        let line = CTLineCreateWithAttributedString(attributed)
        let size = 64
        var pixels = [UInt8](repeating: 0, count: size * size * 4)
        let context = CGContext(
            data: &pixels, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )!
        context.textPosition = CGPoint(x: 4, y: 14)
        CTLineDraw(line, context)
        var count = 0
        for i in stride(from: 0, to: pixels.count, by: 4) where pixels[i + 3] > 0 {
            let r = Int(pixels[i]), g = Int(pixels[i + 1]), b = Int(pixels[i + 2])
            if max(r, g, b) - min(r, g, b) > 40 { count += 1 }
        }
        return count
    }
}
