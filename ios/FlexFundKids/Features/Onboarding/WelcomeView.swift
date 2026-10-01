import SwiftUI

struct WelcomeView: View {
    @Environment(AppModel.self) private var app
    @State private var path: [Route] = []
    @State private var showServerSettings = false
    @State private var deepLinkError: String?
    @State private var isPairingFromLink = false

    enum Route: Hashable { case code(prefill: String?) }

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                Brand.heroBackground.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 22) {
                        if let notice = app.welcomeNotice {
                            Label(notice, systemImage: "info.circle.fill")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.white)
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(.white.opacity(0.18), in: RoundedRectangle(cornerRadius: 14))
                        }

                        Image("Family")
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: 250)
                            .padding(12)
                            .background(.white.opacity(0.92), in: Circle())
                            .accessibilityHidden(true)

                        VStack(spacing: 10) {
                            HStack(spacing: 8) {
                                Image("Mascot")
                                    .resizable()
                                    .scaledToFit()
                                    .frame(width: 44)
                                    .accessibilityHidden(true)
                                Text(headline: "FlexFund Kids")
                                    .font(Brand.headline(56))
                                    .foregroundStyle(.white)
                                    .shadow(color: Brand.purple.opacity(0.4), radius: 0, x: 2, y: 3)
                            }
                            .accessibilityElement(children: .combine)
                            .accessibilityAddTraits(.isHeader)

                            Text("Your fun adventure into the world of money starts here!")
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(.white)
                                .multilineTextAlignment(.center)
                        }

                        VStack(alignment: .leading, spacing: 14) {
                            ValueRow(symbol: "target", text: "Save for the things you want")
                            ValueRow(symbol: "star.fill", text: "Earn rewards for challenges")
                            ValueRow(symbol: "book.fill", text: "Learn how money works")
                        }
                        .padding(18)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.black.opacity(0.14), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Learn to save, set goals, and track your progress")
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 12)
                    .padding(.bottom, 24)
                }
                .scrollBounceBehavior(.basedOnSize)
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 10) {
                    Button {
                        path.append(.code(prefill: nil))
                    } label: {
                        Label("Connect with a code", systemImage: "link")
                            .font(.headline)
                            .frame(maxWidth: .infinity, minHeight: 34)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .tint(.white)
                    .foregroundStyle(Brand.purple)
                    .accessibilityIdentifier("connectWithCode")

                    Text("A grown-up gets your code from the FlexFund Family Dashboard.")
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.92))
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 8)
                .padding(.top, 8)
            }
            .toolbar {
                #if DEBUG
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showServerSettings = true
                    } label: {
                        Image(systemName: "server.rack")
                            .foregroundStyle(.white)
                    }
                    .accessibilityLabel("Server settings")
                }
                #endif
            }
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .code(let prefill): CodeEntryView(prefill: prefill)
                }
            }
            .sheet(isPresented: $showServerSettings) { ServerSettingsView() }
            .overlay {
                if isPairingFromLink {
                    ProgressView("Connecting…")
                        .padding(24)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                }
            }
            .alert("Couldn’t connect", isPresented: Binding(get: { deepLinkError != nil }, set: { if !$0 { deepLinkError = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(deepLinkError ?? "")
            }
            .task(id: app.pendingDeepLinkCode) { await pairFromDeepLink() }
        }
        .tint(Brand.pink)
    }

    private func pairFromDeepLink() async {
        guard let code = app.pendingDeepLinkCode else { return }
        app.pendingDeepLinkCode = nil
        isPairingFromLink = true
        defer { isPairingFromLink = false }
        do {
            try await app.pair(code: code)
        } catch {
            deepLinkError = error.userMessage
        }
    }
}

private struct ValueRow: View {
    let symbol: String
    let text: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Brand.yellow)
                .frame(width: 30)
            Text(text)
                .font(.body.weight(.semibold))
                .foregroundStyle(.white)
        }
    }
}

struct CodeEntryView: View {
    @Environment(AppModel.self) private var app
    @State private var code: String
    @State private var isConnecting = false
    @State private var errorMessage: String?
    @FocusState private var focused: Bool

    init(prefill: String?) {
        _code = State(initialValue: prefill ?? "")
    }

    private var isComplete: Bool { code.count == 6 }

    var body: some View {
        Form {
            Section {
                VStack(spacing: 12) {
                    Image("Mascot")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 72)
                        .accessibilityHidden(true)
                    Text("Ask a grown-up to open the Family Dashboard, choose you, and tap **Connect a device**. Then type the 6-character code here.")
                        .font(.callout)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
            }

            Section {
                TextField("ABC123", text: $code)
                    .font(.system(size: 40, weight: .bold, design: .monospaced))
                    .kerning(8)
                    .multilineTextAlignment(.center)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .keyboardType(.asciiCapable)
                    .textContentType(.oneTimeCode)
                    .submitLabel(.go)
                    .focused($focused)
                    .padding(.vertical, 8)
                    .accessibilityLabel("Connection code")
                    .accessibilityIdentifier("pairingCodeField")
                    .onChange(of: code) { _, newValue in
                        let cleaned = String(newValue.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(6))
                        if cleaned != newValue { code = cleaned }
                        errorMessage = nil
                    }
                    .onSubmit { Task { await connect() } }
            } footer: {
                if let errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                        .font(.footnote.weight(.medium))
                }
            }

            Section {
                Button {
                    Task { await connect() }
                } label: {
                    HStack {
                        Spacer()
                        if isConnecting { ProgressView().padding(.trailing, 6) }
                        Text(isConnecting ? "Connecting…" : "Connect")
                            .font(.headline)
                        Spacer()
                    }
                    .frame(minHeight: 30)
                }
                .disabled(!isComplete || isConnecting)
                .accessibilityIdentifier("connectButton")
            }
        }
        .navigationTitle("Enter your code")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { focused = true }
    }

    private func connect() async {
        guard isComplete, !isConnecting else { return }
        isConnecting = true
        defer { isConnecting = false }
        do {
            try await app.pair(code: code)
        } catch {
            errorMessage = error.userMessage
        }
    }
}

struct ServerSettingsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var url = AppConfig.debugOverride ?? AppConfig.apiBaseURL.absoluteString

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("http://192.168.1.10:8787/api/v1", text: $url)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("API address")
                } footer: {
                    Text("Developer setting. On a real iPhone, use your computer’s network address instead of localhost.")
                }
                Section {
                    Button("Reset to default", role: .destructive) {
                        url = AppConfig.defaultAPIBaseURL
                    }
                }
            }
            .navigationTitle("Server")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        AppConfig.debugOverride = url == AppConfig.defaultAPIBaseURL ? nil : url
                        app.api.baseURL = AppConfig.apiBaseURL
                        dismiss()
                    }
                }
            }
        }
    }
}
