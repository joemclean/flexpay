import SwiftUI

@main
struct FlexFundKidsApp: App {
    @State private var app = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    init() {
        Brand.configureAppearance()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .tint(Color("AccentColor"))
                .environment(app)
                .environment(app.data)
                .onOpenURL { app.handleOpenURL($0) }
                .task { await app.start() }
        }
        .onChange(of: scenePhase) { _, newPhase in
            app.scenePhaseChanged(newPhase)
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        ZStack {
            switch app.phase {
            case .launching:
                LaunchView()
            case .welcome:
                WelcomeView()
                    .transition(.opacity)
            case .locked:
                LockView()
                    .transition(.opacity)
            case .unlocked:
                MainTabView()
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: app.phase)
        .alert(
            "Connect to a new code?",
            isPresented: Binding(
                get: { app.deepLinkNeedsConfirmation != nil },
                set: { if !$0 { app.deepLinkNeedsConfirmation = nil } }
            )
        ) {
            Button("Connect") { app.confirmDeepLink() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This iPhone is connected to \(app.child?.name ?? "someone") right now. Using the new code will switch it.")
        }
    }
}

private struct LaunchView: View {
    var body: some View {
        ZStack {
            Brand.heroBackground.ignoresSafeArea()
            VStack(spacing: 16) {
                Image("Mascot")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 120)
                ProgressView()
                    .tint(.white)
            }
        }
    }
}

struct MainTabView: View {
    @Environment(AppModel.self) private var app

    enum Tab: Hashable { case savings, wallet, learn, friends }
    @State private var selection: Tab = .savings

    var body: some View {
        @Bindable var app = app
        TabView(selection: $selection) {
            SavingsView()
                .tabItem { Label("Savings", systemImage: "dollarsign.circle.fill") }
                .tag(Tab.savings)
            WalletView()
                .tabItem { Label("Wallet", systemImage: "creditcard.fill") }
                .tag(Tab.wallet)
            LearnView()
                .tabItem { Label("Learn", systemImage: "book.fill") }
                .tag(Tab.learn)
            FriendsView()
                .tabItem { Label("Friends", systemImage: "person.2.fill") }
                .tag(Tab.friends)
        }
        .sheet(isPresented: $app.showProfile) {
            ProfileView()
        }
        .alert("Use \(Biometrics.name) next time?", isPresented: $app.offerBiometrics) {
            Button("Use \(Biometrics.name)") { app.acceptBiometricOffer() }
            Button("Not Now", role: .cancel) { app.declineBiometricOffer() }
        } message: {
            Text("Unlock FlexFund Kids with a glance instead of typing your PIN.")
        }
    }
}
