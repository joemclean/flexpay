import XCTest

/// End-to-end journey against a live Family Account API.
/// The test creates its own family (with sample data) and a pairing code, so it needs
/// only `FLEXFUND_API_URL` (passed as `TEST_RUNNER_FLEXFUND_API_URL` to xcodebuild).
final class KidJourneyUITests: XCTestCase {
    private var app: XCUIApplication!
    private let pin = ["2", "5", "8", "0"]

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testKidJourney() throws {
        let fixture = try APIFixture.makeFamilyWithPairingCode()

        app = XCUIApplication()
        app.launchArguments = ["-uiTesting"]
        app.launchEnvironment["FLEXFUND_API_URL"] = APIFixture.baseURL
        app.launch()

        // Welcome → code entry
        let connect = app.buttons["connectWithCode"]
        XCTAssertTrue(connect.waitForExistence(timeout: 15))
        snapshot("01-welcome")
        connect.tap()
        let codeField = app.textFields["pairingCodeField"]
        XCTAssertTrue(codeField.waitForExistence(timeout: 5))
        codeField.tap()
        codeField.typeText(fixture.code)
        snapshot("02-code-entry")
        app.buttons["connectButton"].tap()

        // Create and confirm a PIN
        XCTAssertTrue(app.staticTexts["Create a secret 4-digit PIN"].waitForExistence(timeout: 15))
        snapshot("03-create-pin")
        enterPin()
        XCTAssertTrue(app.staticTexts["Type your new PIN again"].waitForExistence(timeout: 5))
        enterPin()

        // Savings home
        XCTAssertTrue(app.navigationBars["Savings"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["You’re on a 3 week streak!"].waitForExistence(timeout: 10))
        snapshot("04-savings")
        let markDone = app.buttons["complete_Read for 20 minutes"]
        XCTAssertTrue(markDone.waitForExistence(timeout: 5))
        markDone.tap()
        XCTAssertTrue(element("pending_Read for 20 minutes").waitForExistence(timeout: 10))
        app.swipeUp()
        snapshot("05-savings-pots")
        app.staticTexts["New Bike"].tap()
        XCTAssertTrue(app.staticTexts["Still to save"].waitForExistence(timeout: 10))
        snapshot("06-pot-detail")
        app.navigationBars.buttons.element(boundBy: 0).tap()

        // Wallet
        app.tabBars.buttons["Wallet"].tap()
        XCTAssertTrue(app.otherElements["purchaseCard"].waitForExistence(timeout: 10) || app.staticTexts["Purchase Card"].waitForExistence(timeout: 5))
        snapshot("07-wallet")
        let theatre = app.staticTexts["DT Theatre"].firstMatch
        XCTAssertTrue(theatre.waitForExistence(timeout: 5))
        theatre.tap()
        let report = app.buttons["reportProblemButton"]
        if !report.waitForExistence(timeout: 5) { app.swipeUp() }
        XCTAssertTrue(report.waitForExistence(timeout: 10))
        snapshot("08-transaction-detail")
        report.tap()
        app.buttons["I don’t recognize this"].tap()
        XCTAssertTrue(app.staticTexts["A grown-up is checking this"].waitForExistence(timeout: 10))
        snapshot("09-transaction-reported")
        app.buttons["Done"].tap()

        // Learn: pass the "How cards work" quiz
        app.tabBars.buttons["Learn"].tap()
        let lesson = app.buttons["lesson_how-cards-work"]
        XCTAssertTrue(lesson.waitForExistence(timeout: 10))
        snapshot("10-learn")
        lesson.tap()
        let next = app.buttons["lessonNextButton"]
        XCTAssertTrue(next.waitForExistence(timeout: 10))
        snapshot("11-lesson-page")
        next.tap(); next.tap(); next.tap()
        for (index, answer) in [0, 1, 1].enumerated() {
            let option = app.buttons["option_\(answer)"]
            XCTAssertTrue(option.waitForExistence(timeout: 5))
            option.tap()
            if index == 0 { snapshot("12-quiz") }
            app.buttons["quizNextButton"].tap()
        }
        XCTAssertTrue(app.staticTexts["You did it!"].waitForExistence(timeout: 10))
        snapshot("13-quiz-results")
        app.buttons["backToLessons"].tap()

        // Friends: send money to James F (needs a grown-up's approval)
        app.tabBars.buttons["Friends"].tap()
        XCTAssertTrue(app.staticTexts["Abby T"].waitForExistence(timeout: 10))
        snapshot("14-friends")
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("James")
        let james = app.buttons["friend_James F"]
        XCTAssertTrue(james.waitForExistence(timeout: 10))
        snapshot("14b-friends-search")
        james.tap()
        let send = app.buttons["sendButton"]
        XCTAssertTrue(send.waitForExistence(timeout: 10))
        snapshot("15-friend-detail")
        send.tap()
        for key in ["key_2", "key_decimal", "key_5", "key_0"] { app.buttons[key].tap() }
        snapshot("16-amount")
        app.buttons["reviewButton"].tap()
        let submit = app.buttons["submitRequestButton"]
        XCTAssertTrue(submit.waitForExistence(timeout: 5))
        snapshot("17-review")
        submit.tap()
        XCTAssertTrue(app.staticTexts["requestSubmitted"].waitForExistence(timeout: 10))
        snapshot("18-request-submitted")
        app.buttons["requestDoneButton"].tap()

        // Profile → lock → unlock with PIN
        app.tabBars.buttons["Savings"].tap()
        let profile = app.buttons["profileButton"].firstMatch
        XCTAssertTrue(profile.waitForExistence(timeout: 10))
        profile.tap()
        XCTAssertTrue(app.staticTexts["Achievements"].waitForExistence(timeout: 10) || app.staticTexts["ACHIEVEMENTS"].exists)
        sleep(1)
        snapshot("19-profile")
        let lockNow = app.buttons["lockNowButton"]
        for _ in 0..<4 where !(lockNow.exists && lockNow.isHittable) { app.swipeUp() }
        lockNow.tap()
        XCTAssertTrue(app.staticTexts["Enter your PIN to continue"].waitForExistence(timeout: 10))
        snapshot("20-lock")
        app.buttons["key_1"].tap(); app.buttons["key_1"].tap(); app.buttons["key_1"].tap(); app.buttons["key_1"].tap()
        XCTAssertTrue(app.staticTexts["pinMessage"].waitForExistence(timeout: 10))
        snapshot("21-wrong-pin")
        enterPin()
        XCTAssertTrue(app.navigationBars["Savings"].waitForExistence(timeout: 15))

        // The parent sees the kid's requests waiting for approval.
        let approvals = try APIFixture.pendingApprovalTitles(token: fixture.parentToken)
        XCTAssertTrue(approvals.contains("Send to James F"), "approvals: \(approvals)")
        XCTAssertTrue(approvals.contains("Read for 20 minutes"), "approvals: \(approvals)")
    }

    private func element(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }

    private func enterPin() {
        for digit in pin {
            let key = app.buttons["key_\(digit)"]
            XCTAssertTrue(key.waitForExistence(timeout: 5))
            key.tap()
        }
    }

    private func snapshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

/// Talks to the API directly to set up test data. Credentials are random and never logged.
enum APIFixture {
    static var baseURL: String {
        ProcessInfo.processInfo.environment["FLEXFUND_API_URL"] ?? "http://localhost:8789/api/v1"
    }

    struct Fixture {
        let parentToken: String
        let childId: String
        let code: String
    }

    static func makeFamilyWithPairingCode() throws -> Fixture {
        let password = UUID().uuidString + UUID().uuidString
        let email = "uitest+\(UUID().uuidString.prefix(8).lowercased())@example.com"
        let signup = try request("POST", "/auth/signup", body: [
            "familyName": "UI Test family", "name": "Test Parent", "email": email,
            "password": password, "timezone": TimeZone.current.identifier, "includeSampleData": true,
        ])
        guard let token = signup["token"] as? String else { throw FixtureError.unexpected("signup") }
        let children = try request("GET", "/children", token: token)
        guard let items = children["items"] as? [[String: Any]],
              let finn = items.first(where: { $0["name"] as? String == "Finn" }),
              let childId = finn["id"] as? String else { throw FixtureError.unexpected("children") }
        let pairing = try request("POST", "/children/\(childId)/pairing-codes", token: token)
        guard let code = pairing["code"] as? String else { throw FixtureError.unexpected("pairing") }
        return Fixture(parentToken: token, childId: childId, code: code)
    }

    static func pendingApprovalTitles(token: String) throws -> [String] {
        let response = try request("GET", "/approvals", token: token)
        return (response["items"] as? [[String: Any]] ?? []).compactMap { $0["title"] as? String }
    }

    enum FixtureError: Error { case unexpected(String), http(Int, String) }

    private static func request(_ method: String, _ path: String, body: [String: Any]? = nil, token: String? = nil) throws -> [String: Any] {
        var request = URLRequest(url: URL(string: baseURL + path)!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let semaphore = DispatchSemaphore(value: 0)
        var result: Result<(Data, HTTPURLResponse), Error> = .failure(FixtureError.unexpected("no response"))
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error { result = .failure(error) }
            else if let data, let http = response as? HTTPURLResponse { result = .success((data, http)) }
            semaphore.signal()
        }.resume()
        semaphore.wait()
        let (data, http) = try result.get()
        guard (200..<300).contains(http.statusCode) else {
            throw FixtureError.http(http.statusCode, "\(method) \(path)")
        }
        return (try JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }
}
