import SwiftUI

/// The kid's Purchase Card, echoing the prototype's dark-purple card.
struct PurchaseCardView: View {
    let card: Card
    let childName: String

    var body: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Brand.cardGradient)
            GeometryReader { proxy in
                Circle()
                    .fill(Brand.pink.opacity(0.45))
                    .frame(width: proxy.size.width * 0.7, height: proxy.size.width * 0.7)
                    .position(x: proxy.size.width * 0.95, y: proxy.size.height * 0.05)
                Circle()
                    .fill(Brand.yellow.opacity(0.18))
                    .frame(width: proxy.size.width * 0.45, height: proxy.size.width * 0.45)
                    .position(x: proxy.size.width * 0.78, y: proxy.size.height * 1.02)
            }
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text(headline: "Purchase Card")
                        .font(Brand.headline(30, relativeTo: .title))
                        .foregroundStyle(.white)
                    Spacer()
                    Image("Mascot")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 38, height: 38)
                        .accessibilityHidden(true)
                }
                Spacer()
                Image(systemName: "wave.3.right")
                    .font(.title3)
                    .foregroundStyle(.white.opacity(0.8))
                    .accessibilityHidden(true)
                Spacer()
                Text("••••  ••••  ••••  \(card.last4)")
                    .font(.system(.title3, design: .monospaced).weight(.semibold))
                    .foregroundStyle(.white)
                    .accessibilityLabel("Card ending in \(card.last4.map(String.init).joined(separator: " "))")
                Text(childName.uppercased())
                    .font(.footnote.weight(.semibold))
                    .kerning(1.5)
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(.top, 4)
            }
            .padding(20)

            if card.isFrozen {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(.ultraThinMaterial)
                VStack(spacing: 8) {
                    Image(systemName: "snowflake")
                        .font(.system(size: 36, weight: .semibold))
                    Text("Frozen by a grown-up")
                        .font(.headline)
                    Text("Payments won’t work until it’s unfrozen.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityElement(children: .combine)
            }
        }
        .aspectRatio(1.586, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: Brand.purple.opacity(0.3), radius: 14, y: 8)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("purchaseCard")
    }
}

/// A transaction row: category symbol, title, subtitle, signed amount.
struct TransactionRow: View {
    let transaction: Transaction
    var showsTime = true

    var body: some View {
        HStack(spacing: 12) {
            SymbolBadge(symbol: transaction.symbol, tint: transaction.isDeclined ? .gray : transaction.tint)
            VStack(alignment: .leading, spacing: 2) {
                Text(transaction.title)
                    .font(.body.weight(.semibold))
                    .lineLimit(1)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(transaction.isDeclined ? Color.red : Color.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            AmountText(cents: transaction.amountCents, declined: transaction.isDeclined)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    private var subtitle: String {
        if let decline = transaction.declineMessage { return decline }
        let time = transaction.createdAt.formatted(date: .omitted, time: .shortened)
        return showsTime ? "\(transaction.kindLabel) · \(time)" : transaction.kindLabel
    }
}

struct AmountText: View {
    let cents: Int
    var declined = false

    var body: some View {
        Text(Money.signed(cents))
            .font(.body.weight(.semibold).monospacedDigit())
            .foregroundStyle(declined ? Color.secondary : (cents > 0 ? Color.green : Color.primary))
            .strikethrough(declined)
    }
}

/// Transaction detail shown in a sheet, with "Something wrong?" reporting.
struct TransactionDetailView: View {
    let transaction: Transaction
    @Environment(\.dismiss) private var dismiss
    @Environment(KidData.self) private var data
    @State private var report: TransactionReport?
    @State private var loadedReport = false
    @State private var askReason = false
    @State private var isReporting = false
    @State private var reportError: String?
    @State private var reported = 0

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(spacing: 10) {
                        SymbolBadge(symbol: transaction.symbol, tint: transaction.isDeclined ? .gray : transaction.tint, size: 64)
                        Text(transaction.title)
                            .font(.title2.weight(.bold))
                            .multilineTextAlignment(.center)
                        Text(Money.signed(transaction.amountCents))
                            .font(.system(size: 40, weight: .heavy, design: .rounded).monospacedDigit())
                            .foregroundStyle(transaction.isDeclined ? .secondary : (transaction.isIncoming ? Color.green : Color.primary))
                            .strikethrough(transaction.isDeclined)
                        if let decline = transaction.declineMessage {
                            StatusBadge(text: decline, symbol: "xmark.octagon.fill", tint: .red)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .listRowBackground(Color.clear)
                }
                Section {
                    LabeledContent("When", value: transaction.createdAt.formatted(date: .abbreviated, time: .shortened))
                    LabeledContent("Type", value: transaction.kindLabel)
                    if transaction.kind == .cardPurchase {
                        LabeledContent("Category", value: transaction.category.label)
                    }
                    if let pot = transaction.potName {
                        LabeledContent("Pot", value: pot)
                    }
                    if let who = transaction.counterparty {
                        LabeledContent(transaction.amountCents >= 0 ? "From" : "To", value: who)
                    }
                    if let memo = transaction.memo, !memo.isEmpty {
                        LabeledContent("Note", value: memo)
                    }
                }
                if transaction.isDeclined {
                    Section {
                        Text("No money left your pot. If you think this is wrong, ask a grown-up to check your card in the Family Dashboard.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                if transaction.kind != .transfer {
                    reportSection
                }
            }
            .navigationTitle("Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog("What’s wrong?", isPresented: $askReason, titleVisibility: .visible) {
                ForEach(ReportReason.allCases) { reason in
                    Button(reason.label) { Task { await submitReport(reason) } }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("A grown-up will take a look.")
            }
            .sensoryFeedback(.success, trigger: reported)
            .task { await loadReport() }
        }
    }

    @ViewBuilder
    private var reportSection: some View {
        Section {
            if let report {
                switch report.status {
                case .open:
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("A grown-up is checking this").font(.body.weight(.semibold))
                            Text(report.reasonLabel ?? report.reason.label)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "hourglass").foregroundStyle(.orange)
                    }
                    .accessibilityIdentifier("reportStatus")
                case .resolved:
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Checked by a grown-up").font(.body.weight(.semibold))
                            Text(report.resolution?.isEmpty == false ? report.resolution! : "All sorted!")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "checkmark.seal.fill").foregroundStyle(.green)
                    }
                    .accessibilityIdentifier("reportStatus")
                }
            } else if loadedReport {
                Button {
                    askReason = true
                } label: {
                    HStack {
                        Label("Something wrong? Tell a grown-up", systemImage: "exclamationmark.bubble.fill")
                        Spacer()
                        if isReporting { ProgressView() }
                    }
                }
                .disabled(isReporting)
                .accessibilityIdentifier("reportProblemButton")
            }
        } footer: {
            if let reportError {
                Text(reportError).foregroundStyle(.red)
            } else if report == nil, loadedReport {
                Text("Use this if you don’t recognize a payment or the amount looks wrong.")
            }
        }
    }

    private func loadReport() async {
        if let detail = try? await data.transactionDetail(transaction.id) {
            report = detail.report
        }
        loadedReport = true
    }

    private func submitReport(_ reason: ReportReason) async {
        isReporting = true
        defer { isReporting = false }
        do {
            report = try await data.report(transaction, reason: reason, note: nil)
            reportError = nil
            reported += 1
        } catch let error as APIError where error.code == "already_reported" {
            await loadReport()
        } catch {
            reportError = error.userMessage
        }
    }
}

/// Groups transactions into day sections (newest first).
func groupedByDay(_ transactions: [Transaction]) -> [(title: String, items: [Transaction])] {
    let calendar = Calendar.current
    var groups: [(Date, [Transaction])] = []
    for transaction in transactions {
        let day = calendar.startOfDay(for: transaction.createdAt)
        if let last = groups.indices.last, groups[last].0 == day {
            groups[last].1.append(transaction)
        } else {
            groups.append((day, [transaction]))
        }
    }
    return groups.map { (DayFormat.sectionTitle(for: $0.0), $0.1) }
}
