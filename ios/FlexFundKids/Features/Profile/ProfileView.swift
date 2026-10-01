import SwiftUI

struct ProfileView: View {
    @Environment(AppModel.self) private var app
    @Environment(KidData.self) private var data
    @Environment(\.dismiss) private var dismiss
    @State private var selected: Achievement?
    @State private var showPinForBiometrics = false
    @State private var biometricError: String?

    private let columns = [GridItem(.adaptive(minimum: 96), spacing: 12)]

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 16) {
                        Text(app.child?.avatar ?? "🙂")
                            .font(.system(size: 44))
                            .frame(width: 76, height: 76)
                            .background(Brand.pink.opacity(0.15), in: Circle())
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(headline: app.child?.name ?? "")
                                .font(Brand.headline(34, relativeTo: .title))
                                .foregroundStyle(Brand.purple)
                            if let family = app.familyName {
                                Text(family)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section {
                    if data.achievements.isEmpty {
                        ProgressView().frame(maxWidth: .infinity)
                    } else {
                        let earned = data.achievements.filter(\.earned).count
                        Text("\(earned) of \(data.achievements.count) badges earned")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                        LazyVGrid(columns: columns, spacing: 12) {
                            ForEach(data.achievements) { achievement in
                                Button {
                                    selected = achievement
                                } label: {
                                    AchievementTile(achievement: achievement)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, 6)
                    }
                } header: {
                    Text("Achievements")
                } footer: {
                    Text("Tap a badge to see how to earn it.")
                }

                Section {
                    if app.canUseBiometrics {
                        Toggle(isOn: Binding(get: { app.biometricsEnabled }, set: setBiometrics)) {
                            Label("Unlock with \(Biometrics.name)", systemImage: Biometrics.symbol)
                        }
                    } else {
                        Label("\(Biometrics.name) isn’t set up on this iPhone", systemImage: Biometrics.symbol)
                            .foregroundStyle(.secondary)
                    }
                    Button {
                        Task { await app.lock() }
                    } label: {
                        Label("Lock now", systemImage: "lock.fill")
                    }
                    .accessibilityIdentifier("lockNowButton")
                } header: {
                    Text("Security")
                } footer: {
                    if let biometricError {
                        Text(biometricError).foregroundStyle(.red)
                    } else {
                        Text("FlexFund Kids locks itself after 5 minutes in the background.")
                    }
                }

                Section("About") {
                    LabeledContent("Version", value: AppConfig.appVersion)
                    #if DEBUG
                    LabeledContent("Server", value: app.api.baseURL.host() ?? "")
                    #endif
                }
            }
            .navigationTitle("Me")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("profileDone")
                }
            }
            .task { await data.loadAchievements() }
            .sheet(item: $selected) { achievement in
                AchievementDetail(achievement: achievement)
                    .presentationDetents([.height(340)])
            }
            .sheet(isPresented: $showPinForBiometrics) {
                ConfirmPinSheet { pin in
                    if app.enableBiometrics(pin: pin) {
                        biometricError = nil
                    } else {
                        biometricError = "Couldn’t turn on \(Biometrics.name). Try again later."
                    }
                }
            }
        }
    }

    private func setBiometrics(_ on: Bool) {
        if on {
            showPinForBiometrics = true
        } else {
            app.disableBiometrics()
        }
    }
}

private struct AchievementTile: View {
    let achievement: Achievement

    var body: some View {
        VStack(spacing: 6) {
            Text(achievement.emoji)
                .font(.system(size: 34))
                .grayscale(achievement.earned ? 0 : 1)
                .opacity(achievement.earned ? 1 : 0.45)
            Text(achievement.title)
                .font(.caption.weight(.semibold))
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .foregroundStyle(achievement.earned ? .primary : .secondary)
            if achievement.earned {
                Image(systemName: "checkmark.seal.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
            } else {
                ProgressView(value: achievement.progress)
                    .tint(Brand.pink)
                    .frame(width: 56)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 112)
        .padding(6)
        .background(achievement.earned ? Brand.yellow.opacity(0.15) : Color(.tertiarySystemFill),
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(achievement.title), \(achievement.earned ? "earned" : "not earned yet")")
    }
}

private struct AchievementDetail: View {
    let achievement: Achievement

    var body: some View {
        VStack(spacing: 14) {
            Text(achievement.emoji)
                .font(.system(size: 64))
                .grayscale(achievement.earned ? 0 : 1)
            Text(headline: achievement.title)
                .font(Brand.headline(32, relativeTo: .title))
                .foregroundStyle(Brand.purple)
            Text(achievement.description)
                .font(.body)
                .multilineTextAlignment(.center)
            if achievement.earned {
                StatusBadge(text: "Earned!", symbol: "checkmark.seal.fill", tint: .green)
            } else {
                VStack(spacing: 6) {
                    ProgressView(value: achievement.progress).tint(Brand.pink)
                    Text(progressText)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 40)
            }
        }
        .padding(24)
    }

    private var progressText: String {
        if achievement.id.hasPrefix("saved-") {
            return "\(Money.format(achievement.current)) of \(Money.format(achievement.target))"
        }
        return "\(achievement.current) of \(achievement.target)"
    }
}

/// Re-enter the PIN to turn on Face ID (the PIN is then kept behind biometrics).
private struct ConfirmPinSheet: View {
    let onConfirm: (String) -> Void
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var digits = ""
    @State private var message: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 22) {
                Image(systemName: Biometrics.symbol)
                    .font(.system(size: 48))
                    .foregroundStyle(Brand.pink)
                Text("Enter your PIN to turn on \(Biometrics.name)")
                    .font(.headline)
                    .multilineTextAlignment(.center)
                PinDots(filled: digits.count, color: Brand.pink)
                Text(message ?? " ")
                    .font(.callout)
                    .foregroundStyle(.red)
                Keypad(onKey: handle)
                    .disabled(busy)
            }
            .padding()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }

    private func handle(_ key: Keypad.Key) {
        switch key {
        case .digit(let n):
            guard digits.count < 4 else { return }
            digits.append(String(n))
            if digits.count == 4 { Task { await verify() } }
        case .delete:
            if !digits.isEmpty { digits.removeLast() }
        default:
            break
        }
    }

    private func verify() async {
        busy = true
        defer { busy = false }
        do {
            // Unlocking again confirms the PIN with the server and refreshes the session.
            try await app.unlock(pin: digits)
            onConfirm(digits)
            dismiss()
        } catch {
            message = error.userMessage
            digits = ""
        }
    }
}
