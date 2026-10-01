import Foundation
import Observation

/// Loads and caches the kid's data for the tabs. Each section tracks its own error.
@MainActor
@Observable
final class KidData {
    private let api: APIClient

    var home: Home?
    var homeError: String?

    var wallet: Wallet?
    var walletError: String?
    var olderTransactions: [Transaction] = []
    var canLoadMore = true
    var isLoadingMore = false

    var lessons: LessonList?
    var lessonsError: String?

    var contacts: [Contact] = []
    var requests: [MoneyRequest] = []
    var friendsLoaded = false
    var friendsError: String?

    var achievements: [Achievement] = []

    init(api: APIClient) {
        self.api = api
    }

    func reset() {
        home = nil
        homeError = nil
        wallet = nil
        walletError = nil
        olderTransactions = []
        canLoadMore = true
        lessons = nil
        lessonsError = nil
        contacts = []
        requests = []
        friendsLoaded = false
        friendsError = nil
        achievements = []
    }

    // MARK: Savings

    func loadHome() async {
        do {
            home = try await api.get("/kid/home")
            homeError = nil
        } catch is CancellationError {
        } catch {
            homeError = error.userMessage
        }
    }

    func completeChallenge(_ challenge: Challenge) async throws {
        let updated: Challenge = try await api.post("/kid/challenges/\(challenge.id)/complete")
        if let index = home?.challenges.firstIndex(where: { $0.id == challenge.id }) {
            home?.challenges[index].status = updated.status ?? .pending
        }
    }

    func potDetail(_ id: String) async throws -> PotDetail {
        try await api.get("/kid/pots/\(id)")
    }

    // MARK: Wallet

    func loadWallet() async {
        do {
            wallet = try await api.get("/kid/wallet")
            olderTransactions = []
            canLoadMore = (wallet?.transactions.count ?? 0) >= 25
            walletError = nil
        } catch is CancellationError {
        } catch {
            walletError = error.userMessage
        }
    }

    var allTransactions: [Transaction] {
        (wallet?.transactions ?? []) + olderTransactions
    }

    func loadMoreTransactions() async {
        guard canLoadMore, !isLoadingMore, let last = allTransactions.last else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        let before = ISO8601.withFraction.string(from: last.createdAt)
        let encoded = before.addingPercentEncoding(withAllowedCharacters: .urlQueryValueAllowed) ?? before
        do {
            let page: ItemsResponse<Transaction> = try await api.get("/kid/transactions?limit=30&before=\(encoded)")
            let known = Set(allTransactions.map(\.id))
            let fresh = page.items.filter { !known.contains($0.id) && $0.kind != .transfer }
            olderTransactions.append(contentsOf: fresh)
            canLoadMore = page.items.count >= 30
        } catch {
            canLoadMore = false
        }
    }

    func transactionDetail(_ id: String) async throws -> TransactionWithReport {
        try await api.get("/kid/transactions/\(id)")
    }

    func report(_ transaction: Transaction, reason: ReportReason, note: String?) async throws -> TransactionReport {
        try await api.post("/kid/transactions/\(transaction.id)/report", body: NewReport(reason: reason, note: note))
    }

    // MARK: Learn

    func loadLessons() async {
        do {
            lessons = try await api.get("/kid/lessons")
            lessonsError = nil
        } catch is CancellationError {
        } catch {
            lessonsError = error.userMessage
        }
    }

    func lesson(_ id: String) async throws -> Lesson {
        try await api.get("/kid/lessons/\(id)")
    }

    func submitLesson(_ id: String, answers: [Int]) async throws -> LessonResult {
        try await api.post("/kid/lessons/\(id)/complete", body: LessonAnswers(answers: answers))
    }

    // MARK: Friends

    func loadFriends() async {
        do {
            async let contactsResponse: ItemsResponse<Contact> = api.get("/kid/contacts")
            async let requestsResponse: ItemsResponse<MoneyRequest> = api.get("/kid/money-requests")
            contacts = try await contactsResponse.items
            requests = try await requestsResponse.items
            friendsLoaded = true
            friendsError = nil
        } catch is CancellationError {
        } catch {
            friendsError = error.userMessage
        }
    }

    var pendingRequests: [MoneyRequest] { requests.filter { $0.status == .pending } }

    func contactDetail(_ id: String) async throws -> ContactDetail {
        try await api.get("/kid/contacts/\(id)")
    }

    func createRequest(_ request: NewMoneyRequest) async throws -> MoneyRequest {
        let created: MoneyRequest = try await api.post("/kid/money-requests", body: request)
        requests.insert(created, at: 0)
        return created
    }

    func cancelRequest(_ request: MoneyRequest) async throws {
        let updated: MoneyRequest = try await api.post("/kid/money-requests/\(request.id)/cancel")
        if let index = requests.firstIndex(where: { $0.id == request.id }) {
            requests[index] = MoneyRequest(
                id: updated.id, childId: updated.childId, contactId: updated.contactId,
                contactName: requests[index].contactName, contactAvatar: requests[index].contactAvatar,
                direction: updated.direction, amountCents: updated.amountCents, note: updated.note,
                status: updated.status, createdAt: updated.createdAt, reviewedAt: updated.reviewedAt
            )
        }
    }

    // MARK: Achievements

    func loadAchievements() async {
        if let response: ItemsResponse<Achievement> = try? await api.get("/kid/achievements") {
            achievements = response.items
        }
    }
}

extension CharacterSet {
    static let urlQueryValueAllowed: CharacterSet = {
        var set = CharacterSet.urlQueryAllowed
        set.remove(charactersIn: "+&=:")
        return set
    }()
}
