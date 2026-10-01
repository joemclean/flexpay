import SwiftUI

struct WalletView: View {
    @Environment(AppModel.self) private var app
    @Environment(KidData.self) private var data
    @State private var selected: Transaction?

    var body: some View {
        NavigationStack {
            Group {
                if let wallet = data.wallet {
                    content(wallet)
                } else if let error = data.walletError {
                    ContentUnavailableView {
                        Label("Can’t load your wallet", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Try Again") { Task { await data.loadWallet() } }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    ProgressView("Loading…")
                }
            }
            .navigationTitle("Wallet")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { ProfileToolbarButton() } }
            .task(id: app.refreshTick) { await data.loadWallet() }
            .sheet(item: $selected) { transaction in
                TransactionDetailView(transaction: transaction)
            }
        }
    }

    private func content(_ wallet: Wallet) -> some View {
        List {
            Section {
                PurchaseCardView(card: wallet.card, childName: app.child?.name ?? "")
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                    .listRowBackground(Color.clear)
            }

            Section {
                LabeledContent {
                    Text(Money.format(wallet.spendingCents))
                        .font(.title3.weight(.bold).monospacedDigit())
                        .foregroundStyle(.primary)
                } label: {
                    Label("Money to spend", systemImage: "banknote.fill")
                }
                .accessibilityIdentifier("spendingBalance")
                VStack(alignment: .leading, spacing: 8) {
                    LabeledContent {
                        Text(Money.format(wallet.card.remainingTodayCents))
                            .monospacedDigit()
                    } label: {
                        Label("Left to spend today", systemImage: "gauge.with.dots.needle.33percent")
                    }
                    ProgressView(value: Double(wallet.card.spentTodayCents), total: Double(max(wallet.card.dailyLimitCents, 1)))
                        .tint(wallet.card.remainingTodayCents == 0 ? .red : Brand.pink)
                    Text("Daily limit \(Money.format(wallet.card.dailyLimitCents)) · set by a grown-up")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 2)
            }

            let groups = groupedByDay(data.allTransactions)
            if groups.isEmpty {
                Section {
                    ContentUnavailableView("No activity yet", systemImage: "list.bullet.rectangle",
                                           description: Text("Payments and money you get will show up here."))
                }
            }
            ForEach(groups, id: \.title) { group in
                Section(group.title) {
                    ForEach(group.items) { transaction in
                        Button {
                            selected = transaction
                        } label: {
                            TransactionRow(transaction: transaction)
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("Shows details")
                    }
                }
            }

            if data.canLoadMore, !data.allTransactions.isEmpty {
                Section {
                    HStack {
                        Spacer()
                        if data.isLoadingMore {
                            ProgressView()
                        } else {
                            Button("Show older activity") { Task { await data.loadMoreTransactions() } }
                        }
                        Spacer()
                    }
                    .onAppear { Task { await data.loadMoreTransactions() } }
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await data.loadWallet() }
    }
}
