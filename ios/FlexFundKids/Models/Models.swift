import Foundation

// Codable mirrors of the Family Account API (docs/API.md). Money is integer cents.

/// Decodes unknown raw values to a fallback instead of failing the whole response.
protocol ResilientEnum: RawRepresentable, Decodable, Hashable where RawValue == String {
    static var fallback: Self { get }
}

extension ResilientEnum {
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: raw) ?? Self.fallback
    }
}

struct KidChild: Codable, Hashable {
    let id: String
    let name: String
    let avatar: String
    let hasPin: Bool
}

struct FamilyName: Codable, Hashable {
    let name: String
}

struct PairResponse: Decodable {
    let deviceToken: String
    let expiresAt: Date
    let child: KidChild
    let family: FamilyName
}

struct DeviceStatus: Decodable {
    let child: KidChild
    let family: FamilyName
    let lockedUntil: Date?
}

struct KidSession: Decodable {
    let token: String
    let expiresAt: Date
    let child: KidChild
}

struct ItemsResponse<Item: Decodable>: Decodable {
    let items: [Item]
}

// MARK: - Money

struct Pot: Decodable, Identifiable, Hashable {
    let id: String
    let childId: String
    let name: String
    let emoji: String
    let goalCents: Int?
    let balanceCents: Int
    let isSpending: Bool
    let progress: Double?
    let goalReached: Bool
    let sortOrder: Int
    let createdAt: Date

    var remainingCents: Int? {
        guard let goalCents else { return nil }
        return max(0, goalCents - balanceCents)
    }
}

enum TransactionKind: String, ResilientEnum {
    case allowance, reward, deposit, transfer, fee
    case lessonReward = "lesson_reward"
    case cardPurchase = "card_purchase"
    case p2pSent = "p2p_sent"
    case p2pReceived = "p2p_received"
    case unknown
    static let fallback = TransactionKind.unknown
}

enum TransactionStatus: String, ResilientEnum {
    case posted, declined
    static let fallback = TransactionStatus.posted
}

enum TransactionCategory: String, ResilientEnum {
    case food, transport, entertainment, shopping, games, education, gifts, fees, income, savings, other
    static let fallback = TransactionCategory.other
}

struct Transaction: Decodable, Identifiable, Hashable {
    let id: String
    let childId: String
    let potId: String?
    let potName: String?
    let amountCents: Int
    let kind: TransactionKind
    let status: TransactionStatus
    let title: String
    let category: TransactionCategory
    let counterparty: String?
    let memo: String?
    let declineReason: String?
    let createdAt: Date

    var isDeclined: Bool { status == .declined }
    var isIncoming: Bool { amountCents > 0 && !isDeclined }
}

enum CardStatus: String, ResilientEnum {
    case active, frozen
    static let fallback = CardStatus.active
}

struct Card: Decodable, Hashable {
    let id: String
    let childId: String
    let name: String
    let last4: String
    let status: CardStatus
    let dailyLimitCents: Int
    let createdAt: Date
    let spentTodayCents: Int
    let remainingTodayCents: Int

    var isFrozen: Bool { status == .frozen }
}

// MARK: - Challenges

enum ChallengeStatus: String, ResilientEnum {
    case available, pending, done
    static let fallback = ChallengeStatus.available
}

enum Recurrence: String, ResilientEnum {
    case once, daily, weekly
    static let fallback = Recurrence.once

    var label: String {
        switch self {
        case .once: "One time"
        case .daily: "Every day"
        case .weekly: "Every week"
        }
    }
}

struct Challenge: Decodable, Identifiable, Hashable {
    let id: String
    let childId: String
    let title: String
    let emoji: String
    let rewardCents: Int
    let recurrence: Recurrence
    let potId: String?
    let active: Bool
    var status: ChallengeStatus?
    let createdAt: Date
}

struct Home: Decodable {
    let child: KidChild
    let totalCents: Int
    let spendingCents: Int
    let savedCents: Int
    let streakWeeks: Int
    let pots: [Pot]
    var challenges: [Challenge]
    let pendingRequests: Int
    let card: Card
}

struct PotDetail: Decodable {
    let pot: Pot
    let transactions: [Transaction]
}

struct Wallet: Decodable {
    let card: Card
    let spendingCents: Int
    let transactions: [Transaction]
}

// MARK: - Learn

struct LessonSummary: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let emoji: String
    let minutes: Int
    let summary: String
    let completed: Bool
    let score: Int?
    let total: Int
}

struct LessonList: Decodable {
    let rewardCents: Int
    let items: [LessonSummary]
}

struct LessonPage: Decodable, Hashable {
    let emoji: String
    let title: String
    let body: String
}

struct QuizQuestion: Decodable, Hashable {
    let question: String
    let options: [String]
}

struct Lesson: Decodable, Identifiable {
    let id: String
    let title: String
    let emoji: String
    let minutes: Int
    let summary: String
    let pages: [LessonPage]
    let quiz: [QuizQuestion]
    let completed: Bool
    let rewardCents: Int
}

struct QuestionResult: Decodable, Hashable {
    let question: String
    let selectedIndex: Int
    let correctIndex: Int
    let correct: Bool
    let explanation: String
}

struct LessonResult: Decodable {
    let score: Int
    let total: Int
    let passed: Bool
    let results: [QuestionResult]
    let rewardCents: Int
    let alreadyCompleted: Bool
}

struct LessonAnswers: Encodable {
    let answers: [Int]
}

// MARK: - Friends

enum Relationship: String, ResilientEnum {
    case parent, family, friend
    static let fallback = Relationship.friend

    var label: String {
        switch self {
        case .parent: "Parent"
        case .family: "Family"
        case .friend: "Friend"
        }
    }
}

struct Contact: Decodable, Identifiable, Hashable {
    let id: String
    let childId: String
    let name: String
    let avatar: String
    let relationship: Relationship
    let isFavorite: Bool
    let createdAt: Date
}

enum RequestDirection: String, ResilientEnum, Encodable {
    case send, request
    static let fallback = RequestDirection.send
}

enum RequestStatus: String, ResilientEnum {
    case pending, approved, declined, canceled
    static let fallback = RequestStatus.pending

    var label: String {
        switch self {
        case .pending: "Waiting for a grown-up"
        case .approved: "Approved"
        case .declined: "Not approved"
        case .canceled: "Canceled"
        }
    }
}

struct MoneyRequest: Decodable, Identifiable, Hashable {
    let id: String
    let childId: String
    let contactId: String
    let contactName: String?
    let contactAvatar: String?
    let direction: RequestDirection
    let amountCents: Int
    let note: String?
    let status: RequestStatus
    let createdAt: Date
    let reviewedAt: Date?
}

struct ContactDetail: Decodable {
    let contact: Contact
    let canRequest: Bool
    let requests: [MoneyRequest]
}

struct NewMoneyRequest: Encodable {
    let contactId: String
    let direction: RequestDirection
    let amountCents: Int
    let note: String?
}

// MARK: - Achievements

struct Achievement: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let description: String
    let emoji: String
    let current: Int
    let target: Int
    let earned: Bool

    var progress: Double { target > 0 ? min(1, Double(current) / Double(target)) : 0 }
}

// MARK: - Reports ("Something wrong?")

enum ReportReason: String, ResilientEnum, Encodable, CaseIterable, Identifiable {
    case dontRecognize = "dont_recognize"
    case wrongAmount = "wrong_amount"
    case other
    static let fallback = ReportReason.other

    var id: String { rawValue }

    var label: String {
        switch self {
        case .dontRecognize: "I don’t recognize this"
        case .wrongAmount: "The amount is wrong"
        case .other: "Something else"
        }
    }
}

enum ReportStatus: String, ResilientEnum {
    case open, resolved
    static let fallback = ReportStatus.open
}

struct TransactionReport: Decodable, Identifiable, Hashable {
    let id: String
    let transactionId: String
    let reason: ReportReason
    let reasonLabel: String?
    let note: String?
    let status: ReportStatus
    let createdAt: Date
    let resolvedAt: Date?
    let resolution: String?
}

/// `GET /kid/transactions/:id` — the transaction plus any report the kid filed.
struct TransactionWithReport: Decodable {
    let transaction: Transaction
    let report: TransactionReport?

    private enum CodingKeys: String, CodingKey { case report }

    init(from decoder: Decoder) throws {
        transaction = try Transaction(from: decoder)
        report = try decoder.container(keyedBy: CodingKeys.self).decodeIfPresent(TransactionReport.self, forKey: .report)
    }
}

struct NewReport: Encodable {
    let reason: ReportReason
    let note: String?
}

// MARK: - Request bodies

struct PairRequest: Encodable {
    let code: String
    let deviceName: String
    let platform: String
}

struct PinRequest: Encodable {
    let pin: String
}

struct UnlinkRequest: Encodable {
    let email: String
    let password: String
    /// Required only when the parent has two-step verification turned on.
    var code: String?
}
