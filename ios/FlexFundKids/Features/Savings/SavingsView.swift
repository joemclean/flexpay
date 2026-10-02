import SwiftUI

struct SavingsView: View {
    @Environment(AppModel.self) private var app
    @Environment(KidData.self) private var data
    @State private var actionError: String?
    @State private var celebrate = 0

    var body: some View {
        NavigationStack {
            Group {
                if let home = data.home {
                    content(home)
                } else if let error = data.homeError {
                    ContentUnavailableView {
                        Label("Can’t load your savings", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Try Again") { Task { await data.loadHome() } }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    ProgressView("Loading…")
                }
            }
            .navigationTitle("Savings")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { ProfileToolbarButton() } }
            .navigationDestination(for: Pot.self) { PotDetailView(pot: $0) }
            .task(id: app.refreshTick) { await data.loadHome() }
            .alert("Hmm…", isPresented: Binding(get: { actionError != nil }, set: { if !$0 { actionError = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(actionError ?? "")
            }
            .sensoryFeedback(.success, trigger: celebrate)
        }
    }

    private func content(_ home: Home) -> some View {
        List {
            Section {
                BalanceHero(home: home)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }

            Section {
                StreakRow(weeks: home.streakWeeks)
            }

            Section {
                if home.challenges.isEmpty {
                    Text("No challenges right now. Ask a grown-up to add one!")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(home.challenges) { challenge in
                        ChallengeRow(challenge: challenge) {
                            Task { await complete(challenge) }
                        }
                    }
                }
            } header: {
                Text("Challenges")
            } footer: {
                Text("Finish a challenge and a grown-up will check it. Rewards go into your pots!")
            }

            Section("Pots") {
                ForEach(home.pots) { pot in
                    NavigationLink(value: pot) {
                        PotRow(pot: pot)
                    }
                }
            }

            if home.pendingRequests > 0 {
                Section {
                    Label("\(home.pendingRequests) money \(home.pendingRequests == 1 ? "request is" : "requests are") waiting for a grown-up", systemImage: "hourglass")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await data.loadHome() }
    }

    private func complete(_ challenge: Challenge) async {
        do {
            try await data.completeChallenge(challenge)
            celebrate += 1
        } catch {
            actionError = error.userMessage
            await data.loadHome()
        }
    }
}

private struct BalanceHero: View {
    let home: Home

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("All my money")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white.opacity(0.9))
            Text(Money.format(home.totalCents))
                .font(.system(size: 46, weight: .heavy, design: .rounded).monospacedDigit())
                .foregroundStyle(.white)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .accessibilityIdentifier("totalBalance")
            HStack(spacing: 18) {
                HeroStat(label: "To spend", cents: home.spendingCents, symbol: "creditcard.fill")
                HeroStat(label: "Saved", cents: home.savedCents, symbol: "lock.fill")
            }
            .padding(.top, 6)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack(alignment: .bottomTrailing) {
                Brand.heroBackground
                Image("Mascot")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 96)
                    .opacity(0.9)
                    .offset(x: 6, y: 10)
                    .accessibilityHidden(true)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

private struct HeroStat: View {
    let label: String
    let cents: Int
    let symbol: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Label(label, systemImage: symbol)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.9))
            Text(Money.format(cents))
                .font(.headline.monospacedDigit())
                .foregroundStyle(.white)
        }
    }
}

private struct StreakRow: View {
    let weeks: Int

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: weeks > 0 ? "bolt.fill" : "leaf.fill")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(weeks > 0 ? Brand.yellow : .green)
                .frame(width: 48, height: 48)
                .background((weeks > 0 ? Brand.yellow : Color.green).opacity(0.15), in: Circle())
                .symbolEffect(.bounce, value: weeks)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(weeks > 0 ? "You’re on a \(weeks) week streak!" : "Start a streak this week!")
                    .font(.headline)
                Text("Complete more challenges to boost your pots")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("streakRow")
    }
}

private struct ChallengeRow: View {
    let challenge: Challenge
    let onComplete: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            EmojiBadge(emoji: challenge.emoji, size: 46, tint: Brand.yellow)
            VStack(alignment: .leading, spacing: 2) {
                Text(challenge.title)
                    .font(.body.weight(.semibold))
                Text("+\(Money.format(challenge.rewardCents)) · \(challenge.recurrence.label)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            switch challenge.status ?? .available {
            case .available:
                Button("Done!", action: onComplete)
                    .buttonStyle(.borderedProminent)
                    .buttonBorderShape(.capsule)
                    .tint(Brand.pink)
                    .accessibilityLabel("Mark \(challenge.title) as done")
                    .accessibilityIdentifier("complete_\(challenge.title)")
            case .pending:
                StatusBadge(text: "Checking", symbol: "hourglass", tint: .orange)
                    .accessibilityLabel("Waiting for a grown-up to check")
                    .accessibilityIdentifier("pending_\(challenge.title)")
            case .done:
                StatusBadge(text: "Done", symbol: "checkmark.circle.fill", tint: .green)
                    .accessibilityIdentifier("done_\(challenge.title)")
            }
        }
        .padding(.vertical, 2)
    }
}

struct PotRow: View {
    let pot: Pot

    var body: some View {
        HStack(spacing: 12) {
            EmojiBadge(emoji: pot.emoji, size: 46, tint: pot.isSpending ? Brand.yellow : Brand.accent)
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(pot.name)
                        .font(.body.weight(.semibold))
                    Spacer()
                    Text(Money.format(pot.balanceCents))
                        .font(.body.weight(.bold).monospacedDigit())
                }
                if let progress = pot.progress, let goal = pot.goalCents {
                    ProgressView(value: progress)
                        .tint(pot.goalReached ? .green : Brand.pink)
                    Text(pot.goalReached ? "Goal reached! 🎉" : "\(Int((progress * 100).rounded()))% of \(Money.format(goal))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if pot.isSpending {
                    Text("Spending money for your card")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

struct PotDetailView: View {
    let pot: Pot
    @Environment(KidData.self) private var data
    @State private var detail: PotDetail?
    @State private var error: String?

    private var current: Pot { detail?.pot ?? pot }

    var body: some View {
        List {
            Section {
                VStack(spacing: 14) {
                    if let progress = current.progress {
                        Gauge(value: progress) {
                            Text(current.emoji).font(.withEmoji(.body))
                        } currentValueLabel: {
                            Text(current.emoji).font(.emoji(size: 34))
                        }
                        .gaugeStyle(.accessoryCircularCapacity)
                        .tint(current.goalReached ? .green : Brand.pink)
                        .scaleEffect(1.9)
                        .frame(height: 110)
                    } else {
                        EmojiBadge(emoji: current.emoji, size: 96, tint: Brand.yellow)
                    }
                    Text(Money.format(current.balanceCents))
                        .font(.system(size: 40, weight: .heavy, design: .rounded).monospacedDigit())
                    if current.goalReached {
                        StatusBadge(text: "Goal reached!", symbol: "trophy.fill", tint: .green)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .listRowBackground(Color.clear)
            }

            Section {
                if let goal = current.goalCents {
                    LabeledContent("Goal", value: Money.format(goal))
                    LabeledContent("Still to save", value: Money.format(current.remainingCents ?? 0))
                    if let progress = current.progress {
                        LabeledContent("Progress", value: "\(Int((progress * 100).rounded()))%")
                    }
                } else if current.isSpending {
                    Text("This is your spending pot. Your Purchase Card uses money from here.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }

            Section("History") {
                if let detail {
                    if detail.transactions.isEmpty {
                        Text("Nothing here yet.").foregroundStyle(.secondary)
                    }
                    ForEach(detail.transactions) { transaction in
                        TransactionRow(transaction: transaction)
                    }
                } else if let error {
                    Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(.secondary)
                } else {
                    ProgressView()
                }
            }
        }
        .navigationTitle(current.name)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        do {
            detail = try await data.potDetail(pot.id)
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = error.userMessage
        }
    }
}
