import SwiftUI

struct LockView: View {
    @Environment(AppModel.self) private var app

    private enum Mode: Equatable {
        case unlock
        case create
        case confirm(first: String)
    }

    @State private var mode: Mode = .unlock
    @State private var digits = ""
    @State private var message: String?
    @State private var shakes: CGFloat = 0
    @State private var isBusy = false
    @State private var showParentLogin = false
    @State private var triedBiometrics = false
    @State private var errorFeedback = 0

    private var childName: String { app.child?.name ?? "there" }

    var body: some View {
        NavigationStack {
            ZStack {
                Brand.heroBackground.ignoresSafeArea()
                VStack(spacing: 0) {
                    Spacer(minLength: 8)
                    header
                    Spacer(minLength: 16)
                    PinDots(filled: digits.count)
                        .modifier(ShakeEffect(animatableData: shakes))
                        .padding(.bottom, 14)
                    messageView
                        .frame(minHeight: 44)
                    Spacer(minLength: 16)
                    if let lockedUntil = app.lockedUntil, lockedUntil > .now {
                        lockedView(until: lockedUntil)
                    } else {
                        Keypad(leftKey: showsBiometricKey ? .biometric : nil, style: .onHero, onKey: handle)
                            .disabled(isBusy)
                            .opacity(isBusy ? 0.6 : 1)
                    }
                    Spacer(minLength: 20)
                }
                .padding(.horizontal, 24)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Parent login") { showParentLogin = true }
                        .foregroundStyle(.white)
                        .accessibilityIdentifier("parentLoginButton")
                }
            }
            .toolbarBackground(.hidden, for: .navigationBar)
            .sheet(isPresented: $showParentLogin) { ParentLoginView() }
            .sensoryFeedback(.error, trigger: errorFeedback)
        }
        .onAppear {
            mode = app.child?.hasPin == false ? .create : .unlock
        }
        .task { await tryBiometricsOnce() }
    }

    private var showsBiometricKey: Bool {
        mode == .unlock && app.biometricsEnabled && app.canUseBiometrics
    }

    private var header: some View {
        VStack(spacing: 10) {
            Text(app.child?.avatar ?? "👋")
                .font(.emoji(size: 54))
                .frame(width: 96, height: 96)
                .background(.white.opacity(0.22), in: Circle())
                .accessibilityHidden(true)
            HStack(spacing: 10) {
                Text(headline: title)
                    .font(Brand.headline(44))
                    .multilineTextAlignment(.center)
                if mode == .unlock {
                    Image(systemName: "hand.wave.fill")
                        .font(.system(size: 30))
                        .foregroundStyle(Brand.yellow)
                        .accessibilityHidden(true)
                }
            }
            .foregroundStyle(.white)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            Text(subtitle)
                .font(.title3.weight(.medium))
                .foregroundStyle(.white.opacity(0.95))
                .multilineTextAlignment(.center)
        }
    }

    private var title: String {
        switch mode {
        case .unlock: "Hey, \(childName)"
        case .create: "Hi, \(childName)!"
        case .confirm: "One more time"
        }
    }

    private var subtitle: String {
        switch mode {
        case .unlock: "Enter your PIN to continue"
        case .create: "Create a secret 4-digit PIN"
        case .confirm: "Type your new PIN again"
        }
    }

    @ViewBuilder
    private var messageView: some View {
        if isBusy {
            ProgressView().tint(.white)
        } else if let message {
            Text(message)
                .font(.callout.weight(.semibold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(.black.opacity(0.25), in: Capsule())
                .accessibilityIdentifier("pinMessage")
        }
    }

    private func lockedView(until: Date) -> some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let remaining = max(0, Int(until.timeIntervalSince(context.date)))
            VStack(spacing: 12) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 40))
                Text("Too many tries")
                    .font(.title2.weight(.bold))
                Text("Try again in \(remaining / 60):\(String(format: "%02d", remaining % 60))")
                    .font(.title3.monospacedDigit())
                Text("Forgot your PIN? A grown-up can reset it in the Family Dashboard.")
                    .font(.callout)
                    .multilineTextAlignment(.center)
                    .opacity(0.9)
            }
            .foregroundStyle(.white)
            .padding(24)
            .onChange(of: remaining) { _, value in
                if value == 0 { app.lockedUntil = nil }
            }
        }
    }

    // MARK: Input

    private func handle(_ key: Keypad.Key) {
        switch key {
        case .digit(let n):
            guard digits.count < 4 else { return }
            digits.append(String(n))
            message = nil
            if digits.count == 4 { Task { await submit() } }
        case .delete:
            if !digits.isEmpty { digits.removeLast() }
        case .biometric:
            Task { await useBiometrics() }
        case .decimal:
            break
        }
    }

    private func submit() async {
        let pin = digits
        switch mode {
        case .create:
            mode = .confirm(first: pin)
            digits = ""
        case .confirm(let first):
            guard pin == first else {
                fail("Those PINs didn’t match. Let’s start again.")
                mode = .create
                return
            }
            isBusy = true
            defer { isBusy = false }
            do {
                try await app.createPin(pin)
            } catch {
                fail(error.userMessage)
                mode = .create
            }
        case .unlock:
            isBusy = true
            defer { isBusy = false }
            do {
                try await app.unlock(pin: pin)
            } catch let error as APIError {
                switch error.code {
                case "wrong_pin":
                    let left = error.attemptsRemaining.map { $0 == 1 ? " 1 try left." : " \($0) tries left." } ?? ""
                    fail("That PIN isn’t right.\(left)")
                case "pin_not_set":
                    digits = ""
                    mode = .create
                    message = "A grown-up reset your PIN. Make a new one!"
                case "locked":
                    fail(nil)
                default:
                    fail(error.message)
                }
            } catch {
                fail(error.userMessage)
            }
        }
    }

    private func fail(_ text: String?) {
        message = text
        digits = ""
        errorFeedback += 1
        withAnimation(.linear(duration: 0.4)) { shakes += 1 }
    }

    private func tryBiometricsOnce() async {
        guard !triedBiometrics, showsBiometricKey, app.lockedUntil == nil else { return }
        triedBiometrics = true
        try? await Task.sleep(for: .milliseconds(350))
        await useBiometrics()
    }

    private func useBiometrics() async {
        isBusy = true
        let ok = await app.unlockWithBiometrics()
        isBusy = false
        if !ok, app.phase == .locked { message = "Type your PIN instead." }
    }
}

/// "Parent login": a grown-up disconnects this iPhone with their dashboard credentials.
struct ParentLoginView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var needsCode = false
    @State private var errorMessage: String?
    @State private var isWorking = false
    @State private var confirm = false

    private var canSubmit: Bool {
        email.contains("@") && !password.isEmpty && (!needsCode || code.count == 6) && !isWorking
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label {
                        Text("For grown-ups. Sign in with your Family Dashboard account to disconnect \(app.child?.name ?? "this child") from this iPhone.")
                    } icon: {
                        Image(systemName: "person.badge.shield.checkmark.fill")
                            .foregroundStyle(Brand.purple)
                    }
                    .font(.callout)
                }
                Section("Family Dashboard account") {
                    TextField("Email", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                    if needsCode {
                        TextField("6-digit code", text: $code)
                            .textContentType(.oneTimeCode)
                            .keyboardType(.numberPad)
                            .onChange(of: code) { _, value in
                                let digits = String(value.filter(\.isNumber).prefix(6))
                                if digits != value { code = digits }
                            }
                    }
                }
                if needsCode {
                    Section {
                        Text("Two-step verification is on. Enter the code from your authenticator app.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                }
                Section {
                    Button(role: .destructive) {
                        confirm = true
                    } label: {
                        HStack {
                            Spacer()
                            if isWorking { ProgressView().padding(.trailing, 6) }
                            Text("Disconnect this iPhone")
                            Spacer()
                        }
                    }
                    .disabled(!canSubmit)
                } footer: {
                    Text("To reconnect later, create a new code in the Family Dashboard.")
                }
            }
            .navigationTitle("Parent login")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .confirmationDialog("Disconnect this iPhone?", isPresented: $confirm, titleVisibility: .visible) {
                Button("Disconnect", role: .destructive) { Task { await submit() } }
            } message: {
                Text("\(app.child?.name ?? "Your child") will need a new code to use FlexFund Kids here again.")
            }
        }
    }

    private func submit() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await app.unlink(email: email.trimmingCharacters(in: .whitespaces), password: password, code: needsCode ? code : nil)
            dismiss()
        } catch let error as APIError where error.code == "mfa_required" {
            needsCode = true
            errorMessage = nil
        } catch {
            errorMessage = error.userMessage
        }
    }
}
