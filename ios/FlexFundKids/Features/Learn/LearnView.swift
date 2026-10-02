import SwiftUI

struct LearnView: View {
    @Environment(AppModel.self) private var app
    @Environment(KidData.self) private var data

    var body: some View {
        NavigationStack {
            Group {
                if let lessons = data.lessons {
                    List {
                        Section {
                            HStack(spacing: 14) {
                                Image("Mascot")
                                    .resizable()
                                    .scaledToFit()
                                    .frame(width: 56)
                                    .accessibilityHidden(true)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(headline: "Learn & earn")
                                        .font(Brand.headline(28, relativeTo: .title2))
                                        .foregroundStyle(Brand.purple)
                                    Text(lessons.rewardCents > 0
                                         ? "Pass a quiz to earn \(Money.format(lessons.rewardCents)) for your spending pot."
                                         : "Short lessons about money, with a quiz at the end.")
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.vertical, 4)
                            let done = lessons.items.filter(\.completed).count
                            VStack(alignment: .leading, spacing: 6) {
                                Text("\(done) of \(lessons.items.count) lessons done")
                                    .font(.subheadline.weight(.semibold))
                                ProgressView(value: Double(done), total: Double(max(lessons.items.count, 1)))
                                    .tint(Brand.pink)
                            }
                            .padding(.vertical, 2)
                        }

                        Section("Lessons") {
                            ForEach(lessons.items) { lesson in
                                NavigationLink(value: lesson) {
                                    LessonRow(lesson: lesson, rewardCents: lessons.rewardCents)
                                }
                                .accessibilityIdentifier("lesson_\(lesson.id)")
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .refreshable { await data.loadLessons() }
                } else if let error = data.lessonsError {
                    ContentUnavailableView {
                        Label("Can’t load lessons", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Try Again") { Task { await data.loadLessons() } }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    ProgressView("Loading…")
                }
            }
            .navigationTitle("Learn")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { ProfileToolbarButton() } }
            .navigationDestination(for: LessonSummary.self) { LessonView(summary: $0) }
            .task(id: app.refreshTick) { await data.loadLessons() }
        }
    }
}

private struct LessonRow: View {
    let lesson: LessonSummary
    let rewardCents: Int

    var body: some View {
        HStack(spacing: 12) {
            EmojiBadge(emoji: lesson.emoji, size: 48, tint: lesson.completed ? .green : Brand.accent)
            VStack(alignment: .leading, spacing: 3) {
                Text(lesson.title)
                    .font(.body.weight(.semibold))
                Text(lesson.summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                Label("\(lesson.minutes) min", systemImage: "clock")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 6)
            if lesson.completed {
                Image(systemName: "checkmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.green)
                    .accessibilityLabel("Completed")
            } else if rewardCents > 0 {
                StatusBadge(text: "+\(Money.format(rewardCents))", tint: Brand.pink)
            }
        }
        .padding(.vertical, 4)
    }
}

struct LessonView: View {
    let summary: LessonSummary
    @Environment(KidData.self) private var data
    @Environment(\.dismiss) private var dismiss

    private enum Stage { case reading, quiz, results(LessonResult) }

    @State private var lesson: Lesson?
    @State private var loadError: String?
    @State private var stage: Stage = .reading
    @State private var page = 0
    @State private var questionIndex = 0
    @State private var answers: [Int] = []
    @State private var selected: Int?
    @State private var submitting = false
    @State private var submitError: String?

    var body: some View {
        Group {
            if let lesson {
                switch stage {
                case .reading: reading(lesson)
                case .quiz: quiz(lesson)
                case .results(let result): results(lesson, result)
                }
            } else if let loadError {
                ContentUnavailableView {
                    Label("Can’t open this lesson", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("Try Again") { Task { await load() } }
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle(summary.title)
        .navigationBarTitleDisplayMode(.inline)
        .background(Color(.systemGroupedBackground))
        .toolbar(.hidden, for: .tabBar)
        .task { await load() }
    }

    private func load() async {
        do {
            lesson = try await data.lesson(summary.id)
            loadError = nil
        } catch is CancellationError {
        } catch {
            loadError = error.userMessage
        }
    }

    // MARK: Reading

    private func reading(_ lesson: Lesson) -> some View {
        VStack(spacing: 0) {
            TabView(selection: $page) {
                ForEach(Array(lesson.pages.enumerated()), id: \.offset) { index, item in
                    VStack(spacing: 18) {
                        Text(item.emoji)
                            .font(.emoji(size: 88))
                            .accessibilityHidden(true)
                        Text(headline: item.title)
                            .font(Brand.headline(34, relativeTo: .title))
                            .foregroundStyle(Brand.purple)
                            .multilineTextAlignment(.center)
                        Text(item.body)
                            .font(.title3)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.primary)
                    }
                    .padding(28)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
            .indexViewStyle(.page(backgroundDisplayMode: .always))

            Button {
                if page < lesson.pages.count - 1 {
                    withAnimation { page += 1 }
                } else {
                    answers = []
                    questionIndex = 0
                    selected = nil
                    stage = .quiz
                }
            } label: {
                Text(page < lesson.pages.count - 1 ? "Next" : "Start the quiz")
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: 34)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
            .accessibilityIdentifier("lessonNextButton")
        }
    }

    // MARK: Quiz

    private func quiz(_ lesson: Lesson) -> some View {
        let question = lesson.quiz[questionIndex]
        let isLast = questionIndex == lesson.quiz.count - 1
        return ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                ProgressView(value: Double(questionIndex + 1), total: Double(lesson.quiz.count)) {
                    Text("Question \(questionIndex + 1) of \(lesson.quiz.count)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                .tint(Brand.pink)

                Text(question.question)
                    .font(.title2.weight(.bold))
                    .fixedSize(horizontal: false, vertical: true)

                VStack(spacing: 12) {
                    ForEach(Array(question.options.enumerated()), id: \.offset) { index, option in
                        Button {
                            selected = index
                        } label: {
                            HStack {
                                Text(option)
                                    .font(.body.weight(.semibold))
                                    .multilineTextAlignment(.leading)
                                Spacer()
                                Image(systemName: selected == index ? "checkmark.circle.fill" : "circle")
                                    .font(.title3)
                                    .foregroundStyle(selected == index ? Brand.pink : Color.secondary)
                            }
                            .padding(16)
                            .frame(maxWidth: .infinity, minHeight: 56)
                            .background(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .fill(selected == index ? Brand.pink.opacity(0.15) : Color(.secondarySystemGroupedBackground))
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .strokeBorder(selected == index ? Brand.pink : Color(.separator), lineWidth: selected == index ? 2 : 1)
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(selected == index ? .isSelected : [])
                        .accessibilityIdentifier("option_\(index)")
                    }
                }

                if let submitError {
                    Label(submitError, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                        .font(.callout)
                }

                Button {
                    guard let selected else { return }
                    answers.append(selected)
                    if isLast {
                        Task { await submit(lesson) }
                    } else {
                        questionIndex += 1
                        self.selected = nil
                    }
                } label: {
                    HStack {
                        if submitting { ProgressView().padding(.trailing, 6) }
                        Text(isLast ? "Check my answers" : "Next question")
                            .font(.headline)
                    }
                    .frame(maxWidth: .infinity, minHeight: 34)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(selected == nil || submitting)
                .accessibilityIdentifier("quizNextButton")
            }
            .padding(20)
        }
    }

    private func submit(_ lesson: Lesson) async {
        submitting = true
        defer { submitting = false }
        do {
            let result = try await data.submitLesson(lesson.id, answers: answers)
            stage = .results(result)
            submitError = nil
            if result.passed { await data.loadLessons() }
        } catch {
            answers.removeLast()
            submitError = error.userMessage
        }
    }

    // MARK: Results

    private func results(_ lesson: Lesson, _ result: LessonResult) -> some View {
        List {
            Section {
                VStack(spacing: 12) {
                    Image(systemName: result.passed ? "party.popper.fill" : "arrow.counterclockwise.circle.fill")
                        .font(.system(size: 64, weight: .semibold))
                        .foregroundStyle(result.passed ? Brand.yellow : Brand.accent)
                        .symbolRenderingMode(.hierarchical)
                        .symbolEffect(.bounce, value: result.score)
                        .accessibilityHidden(true)
                    Text(headline: result.passed ? "You did it!" : "Nice try!")
                        .font(Brand.headline(40))
                        .foregroundStyle(Brand.purple)
                    Text("\(result.score) out of \(result.total) right")
                        .font(.title3.weight(.semibold))
                        .accessibilityIdentifier("quizScore")
                    if result.rewardCents > 0 {
                        StatusBadge(text: "+\(Money.format(result.rewardCents)) added to your spending pot", symbol: "star.fill", tint: .green)
                    } else if result.passed, result.alreadyCompleted {
                        Text("You already earned the reward for this lesson.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else if !result.passed {
                        Text("Get \(Int(ceil(Double(result.total) * 2 / 3))) right to pass. Have another go!")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .listRowBackground(Color.clear)
            }
            .sensoryFeedback(result.passed ? .success : .warning, trigger: result.score)

            Section("Answers") {
                ForEach(Array(result.results.enumerated()), id: \.offset) { index, item in
                    VStack(alignment: .leading, spacing: 6) {
                        Label {
                            Text(item.question).font(.body.weight(.semibold))
                        } icon: {
                            Image(systemName: item.correct ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .foregroundStyle(item.correct ? .green : .red)
                        }
                        if !item.correct, lesson.quiz.indices.contains(index),
                           lesson.quiz[index].options.indices.contains(item.correctIndex) {
                            Text("Answer: \(lesson.quiz[index].options[item.correctIndex])")
                                .font(.subheadline.weight(.medium))
                        }
                        Text(item.explanation)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 2)
                }
            }

            Section {
                if result.passed {
                    Button("Back to lessons") { dismiss() }
                        .frame(maxWidth: .infinity)
                        .accessibilityIdentifier("backToLessons")
                } else {
                    Button("Try the quiz again") {
                        answers = []
                        questionIndex = 0
                        selected = nil
                        stage = .quiz
                    }
                    .frame(maxWidth: .infinity)
                    Button("Read the lesson again") {
                        page = 0
                        stage = .reading
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }
}
