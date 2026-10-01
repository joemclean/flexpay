import SwiftUI

struct FriendsView: View {
    @Environment(AppModel.self) private var app
    @Environment(KidData.self) private var data
    @State private var search = ""
    @State private var cancelError: String?

    private var filtered: [Contact] {
        let query = search.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return data.contacts }
        return data.contacts.filter { $0.name.localizedCaseInsensitiveContains(query) }
    }

    private var sections: [(letter: String, contacts: [Contact])] {
        let grouped = Dictionary(grouping: filtered) { String($0.name.prefix(1)).uppercased() }
        return grouped.keys.sorted().map { ($0, grouped[$0]!.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if data.friendsLoaded {
                    list
                } else if let error = data.friendsError {
                    ContentUnavailableView {
                        Label("Can’t load your friends", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Try Again") { Task { await data.loadFriends() } }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    ProgressView("Loading…")
                }
            }
            .navigationTitle("Friends")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { ProfileToolbarButton() } }
            .searchable(text: $search, prompt: "Search friends")
            .navigationDestination(for: Contact.self) { FriendDetailView(contact: $0) }
            .task(id: app.refreshTick) { await data.loadFriends() }
            .alert("Couldn’t cancel", isPresented: Binding(get: { cancelError != nil }, set: { if !$0 { cancelError = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(cancelError ?? "")
            }
        }
    }

    private var list: some View {
        List {
            if search.isEmpty {
                let favorites = data.contacts.filter(\.isFavorite)
                if !favorites.isEmpty {
                    Section("Favorites") {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 18) {
                                ForEach(favorites) { contact in
                                    NavigationLink(value: contact) {
                                        VStack(spacing: 6) {
                                            EmojiBadge(emoji: contact.avatar, size: 60, tint: Brand.accent)
                                            Text(contact.name)
                                                .font(.caption.weight(.semibold))
                                                .foregroundStyle(.primary)
                                                .lineLimit(1)
                                        }
                                        .frame(width: 72)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel(contact.name)
                                }
                            }
                            .padding(.vertical, 6)
                        }
                    }
                }

                if !data.pendingRequests.isEmpty {
                    Section {
                        ForEach(data.pendingRequests) { request in
                            PendingRequestRow(request: request)
                                .swipeActions {
                                    Button("Cancel", role: .destructive) { Task { await cancel(request) } }
                                }
                                .contextMenu {
                                    Button("Cancel request", systemImage: "xmark.circle", role: .destructive) {
                                        Task { await cancel(request) }
                                    }
                                }
                        }
                    } header: {
                        Text("Waiting for a grown-up")
                    } footer: {
                        Text("Swipe left on a request to cancel it.")
                    }
                }
            }

            if filtered.isEmpty {
                if search.isEmpty {
                    ContentUnavailableView("No friends yet", systemImage: "person.2",
                                           description: Text("Ask a grown-up to add your friends in the Family Dashboard."))
                } else {
                    ContentUnavailableView.search(text: search)
                }
            } else {
                ForEach(sections, id: \.letter) { section in
                    Section(section.letter) {
                        ForEach(section.contacts) { contact in
                            NavigationLink(value: contact) {
                                ContactRow(contact: contact)
                            }
                            .accessibilityIdentifier("friend_\(contact.name)")
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await data.loadFriends() }
    }

    private func cancel(_ request: MoneyRequest) async {
        do {
            try await data.cancelRequest(request)
        } catch {
            cancelError = error.userMessage
            await data.loadFriends()
        }
    }
}

struct ContactRow: View {
    let contact: Contact

    var body: some View {
        HStack(spacing: 12) {
            EmojiBadge(emoji: contact.avatar, size: 44, tint: Brand.accent)
            Text(contact.name)
                .font(.body.weight(.semibold))
            if contact.relationship != .friend {
                StatusBadge(text: contact.relationship.label, tint: Brand.purple)
            }
            Spacer()
            if contact.isFavorite {
                Image(systemName: "star.fill")
                    .foregroundStyle(Brand.yellow)
                    .accessibilityLabel("Favorite")
            }
        }
        .padding(.vertical, 2)
    }
}

private struct PendingRequestRow: View {
    let request: MoneyRequest

    var body: some View {
        HStack(spacing: 12) {
            EmojiBadge(emoji: request.contactAvatar ?? "🙂", size: 40, tint: .orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(request.direction == .send ? "Send to \(request.contactName ?? "friend")" : "Ask \(request.contactName ?? "parent")")
                    .font(.body.weight(.semibold))
                Text(request.note?.isEmpty == false ? request.note! : request.createdAt.formatted(.relative(presentation: .named)))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Text(Money.format(request.amountCents))
                .font(.body.weight(.bold).monospacedDigit())
        }
        .accessibilityElement(children: .combine)
    }
}

struct FriendDetailView: View {
    let contact: Contact
    @Environment(KidData.self) private var data
    @State private var detail: ContactDetail?
    @State private var error: String?
    @State private var flow: RequestDirection?

    var body: some View {
        List {
            Section {
                VStack(spacing: 10) {
                    EmojiBadge(emoji: contact.avatar, size: 96, tint: Brand.accent)
                    Text(contact.name)
                        .font(.title.weight(.bold))
                    if contact.relationship != .friend {
                        StatusBadge(text: contact.relationship.label, tint: Brand.purple)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
                .listRowBackground(Color.clear)
            }

            Section {
                HStack(spacing: 12) {
                    Button {
                        flow = .send
                    } label: {
                        Label("Send", systemImage: "paperplane.fill")
                            .font(.headline)
                            .frame(maxWidth: .infinity, minHeight: 34)
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("sendButton")

                    if detail?.canRequest ?? (contact.relationship == .parent) {
                        Button {
                            flow = .request
                        } label: {
                            Label("Ask", systemImage: "hand.raised.fill")
                                .font(.headline)
                                .frame(maxWidth: .infinity, minHeight: 34)
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("askButton")
                    }
                }
                .controlSize(.large)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            } footer: {
                Text("A grown-up approves every request before any money moves.")
            }

            Section("History") {
                if let detail {
                    if detail.requests.isEmpty {
                        Text("No money sent or asked for yet.").foregroundStyle(.secondary)
                    }
                    ForEach(detail.requests) { request in
                        HStack {
                            Image(systemName: request.direction == .send ? "paperplane.fill" : "hand.raised.fill")
                                .foregroundStyle(request.direction == .send ? .blue : .green)
                                .frame(width: 28)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(request.direction == .send ? "You sent" : "You asked")
                                    .font(.body.weight(.semibold))
                                Text(request.note?.isEmpty == false ? request.note! : request.createdAt.formatted(date: .abbreviated, time: .omitted))
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 4) {
                                Text(Money.format(request.amountCents))
                                    .font(.body.weight(.bold).monospacedDigit())
                                RequestStatusBadge(status: request.status)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                } else if let error {
                    Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(.secondary)
                } else {
                    ProgressView()
                }
            }
        }
        .navigationTitle(contact.name)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $flow, onDismiss: { Task { await load() } }) { direction in
            MoneyRequestFlow(contact: contact, direction: direction)
        }
    }

    private func load() async {
        do {
            detail = try await data.contactDetail(contact.id)
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = error.userMessage
        }
    }
}

extension RequestDirection: Identifiable {
    var id: String { rawValue }
}

struct RequestStatusBadge: View {
    let status: RequestStatus

    var body: some View {
        switch status {
        case .pending: StatusBadge(text: "Waiting", symbol: "hourglass", tint: .orange)
        case .approved: StatusBadge(text: "Approved", symbol: "checkmark", tint: .green)
        case .declined: StatusBadge(text: "Not approved", symbol: "xmark", tint: .red)
        case .canceled: StatusBadge(text: "Canceled", tint: .secondary)
        }
    }
}

/// Amount → review → submitted. Every request waits for a parent.
struct MoneyRequestFlow: View {
    let contact: Contact
    let direction: RequestDirection
    @Environment(KidData.self) private var data
    @Environment(\.dismiss) private var dismiss

    private enum Step { case amount, review, done(MoneyRequest) }

    @State private var step: Step = .amount
    @State private var amountText = ""
    @State private var note = ""
    @State private var submitting = false
    @State private var errorMessage: String?
    @State private var success = 0

    private var amountCents: Int {
        let parts = amountText.split(separator: ".", omittingEmptySubsequences: false)
        let dollars = Int(parts.first ?? "") ?? 0
        var cents = 0
        if parts.count > 1 {
            let fraction = String(parts[1].prefix(2)).padding(toLength: 2, withPad: "0", startingAt: 0)
            cents = Int(fraction) ?? 0
        }
        return dollars * 100 + cents
    }

    private var isDone: Bool {
        if case .done = step { return true }
        return false
    }

    private var spending: Int? { data.home?.spendingCents ?? data.wallet?.spendingCents }
    private let maxCents = 10_000

    private var amountProblem: String? {
        if amountCents > maxCents { return "The most you can \(direction == .send ? "send" : "ask for") is \(Money.format(maxCents))." }
        if direction == .send, let spending, amountCents > spending { return "You have \(Money.format(spending)) to spend." }
        return nil
    }

    var body: some View {
        NavigationStack {
            Group {
                switch step {
                case .amount: amountStep
                case .review: reviewStep
                case .done(let request): doneStep(request)
                }
            }
            .navigationTitle(direction == .send ? "Send to \(contact.name)" : "Ask \(contact.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if !isDone {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                }
            }
            .interactiveDismissDisabled(submitting)
            .sensoryFeedback(.success, trigger: success)
        }
    }

    private var amountStep: some View {
        VStack(spacing: 16) {
            Spacer(minLength: 4)
            EmojiBadge(emoji: contact.avatar, size: 64, tint: Brand.accent)
            Text(amountText.isEmpty ? "$0" : "$" + amountText)
                .font(.system(size: 60, weight: .heavy, design: .rounded).monospacedDigit())
                .foregroundStyle(amountProblem == nil ? Color.primary : Color.red)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
                .accessibilityLabel(Money.spoken(amountCents))
                .accessibilityIdentifier("amountDisplay")
            Text(amountProblem ?? (direction == .send ? spending.map { "You have \(Money.format($0)) to spend" } ?? " " : "A grown-up will decide"))
                .font(.subheadline)
                .foregroundStyle(amountProblem == nil ? Color.secondary : Color.red)
            TextField("What’s it for? (optional)", text: $note)
                .textFieldStyle(.roundedBorder)
                .submitLabel(.done)
                .padding(.horizontal, 28)
                .accessibilityIdentifier("noteField")
            Spacer(minLength: 4)
            Keypad(leftKey: .decimal, onKey: handle)
            Button {
                step = .review
            } label: {
                Text("Review")
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: 34)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(amountCents <= 0 || amountProblem != nil)
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
            .accessibilityIdentifier("reviewButton")
        }
        .task { if spending == nil { await data.loadHome() } }
    }

    private func handle(_ key: Keypad.Key) {
        switch key {
        case .digit(let n):
            if let dot = amountText.firstIndex(of: ".") {
                guard amountText.distance(from: dot, to: amountText.endIndex) <= 2 else { return }
            } else if amountText.count >= 3 { return }
            if amountText == "0" { amountText = "" }
            amountText.append(String(n))
        case .decimal:
            if !amountText.contains(".") { amountText += amountText.isEmpty ? "0." : "." }
        case .delete:
            if !amountText.isEmpty { amountText.removeLast() }
        case .biometric:
            break
        }
    }

    private var reviewStep: some View {
        List {
            Section {
                LabeledContent(direction == .send ? "To" : "Ask") {
                    Text("\(contact.avatar) \(contact.name)")
                }
                LabeledContent("Amount", value: Money.format(amountCents))
                if !note.trimmingCharacters(in: .whitespaces).isEmpty {
                    LabeledContent("For", value: note)
                }
                if direction == .send, let spending {
                    LabeledContent("Left after", value: Money.format(max(0, spending - amountCents)))
                }
            } footer: {
                Text(direction == .send
                     ? "A grown-up will check this before the money is sent. Make sure the name and amount are right!"
                     : "\(contact.name) will get your request in the Family Dashboard.")
            }
            if let errorMessage {
                Section {
                    Label(errorMessage, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red)
                }
            }
            Section {
                Button {
                    Task { await submit() }
                } label: {
                    HStack {
                        Spacer()
                        if submitting { ProgressView().padding(.trailing, 6) }
                        Text(direction == .send ? "Send request" : "Ask for money").font(.headline)
                        Spacer()
                    }
                }
                .disabled(submitting)
                .accessibilityIdentifier("submitRequestButton")
                Button("Change amount") { step = .amount }
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private func doneStep(_ request: MoneyRequest) -> some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: "hourglass.circle.fill")
                .font(.system(size: 84))
                .foregroundStyle(.orange)
                .symbolRenderingMode(.hierarchical)
            Text(headline: "Waiting for a grown-up")
                .font(Brand.headline(36, relativeTo: .title))
                .foregroundStyle(Brand.purple)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
                .accessibilityIdentifier("requestSubmitted")
            Text(direction == .send
                 ? "We’ll send \(Money.format(request.amountCents)) to \(contact.name) once it’s approved."
                 : "We asked \(contact.name) for \(Money.format(request.amountCents)).")
                .font(.title3)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 24)
            Spacer()
            Button {
                dismiss()
            } label: {
                Text("Done")
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: 34)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
            .accessibilityIdentifier("requestDoneButton")
        }
    }

    private func submit() async {
        submitting = true
        defer { submitting = false }
        do {
            let trimmed = note.trimmingCharacters(in: .whitespaces)
            let request = try await data.createRequest(NewMoneyRequest(
                contactId: contact.id, direction: direction, amountCents: amountCents, note: trimmed.isEmpty ? nil : trimmed
            ))
            success += 1
            step = .done(request)
        } catch {
            errorMessage = error.userMessage
        }
    }
}
