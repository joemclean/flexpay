export interface LessonPage {
  emoji: string;
  title: string;
  body: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface Lesson {
  id: string;
  title: string;
  emoji: string;
  minutes: number;
  summary: string;
  pages: LessonPage[];
  quiz: QuizQuestion[];
}

export const PASS_RATIO = 2 / 3;

export const LESSONS: Lesson[] = [
  {
    id: 'what-is-money',
    title: 'What is money?',
    emoji: '💵',
    minutes: 3,
    summary: 'Where money comes from and why we use it.',
    pages: [
      {
        emoji: '🐚',
        title: 'Before money',
        body: 'Long ago people traded things they had for things they needed — like swapping eggs for shoes. That was called bartering, and it was tricky when nobody wanted your eggs!',
      },
      {
        emoji: '🪙',
        title: 'Money makes swapping easy',
        body: 'Money is something everyone agrees has value. Instead of finding someone who wants your eggs, you can sell them for money and spend it on anything.',
      },
      {
        emoji: '📱',
        title: 'Money you can’t see',
        body: 'Today lots of money is digital. When you tap your Purchase Card, numbers move from your spending pot to the shop — no coins needed. It’s still real money!',
      },
    ],
    quiz: [
      {
        question: 'What is trading things without money called?',
        options: ['Bartering', 'Borrowing', 'Banking'],
        answerIndex: 0,
        explanation: 'Bartering means swapping goods directly, like eggs for shoes.',
      },
      {
        question: 'Why is money useful?',
        options: ['It’s shiny', 'Everyone agrees it has value', 'It never runs out'],
        answerIndex: 1,
        explanation: 'Money works because everyone agrees it’s worth something.',
      },
      {
        question: 'When you tap your card, is that real money?',
        options: ['No, it’s pretend', 'Yes, it comes out of your pot', 'Only on weekends'],
        answerIndex: 1,
        explanation: 'Card payments are real — they come out of your spending pot.',
      },
    ],
  },
  {
    id: 'needs-vs-wants',
    title: 'Needs vs. wants',
    emoji: '🛒',
    minutes: 3,
    summary: 'Tell the difference between must-haves and nice-to-haves.',
    pages: [
      {
        emoji: '🍎',
        title: 'Needs',
        body: 'Needs are things you can’t do without — like food, a home, clothes and getting to school.',
      },
      {
        emoji: '🎮',
        title: 'Wants',
        body: 'Wants are things that are fun but not necessary — like a new game, sweets or the latest sneakers.',
      },
      {
        emoji: '🤔',
        title: 'Ask yourself',
        body: 'Before you buy something, ask: “Do I need this, or do I want it?” Wants are okay! Just make sure your needs are covered first.',
      },
    ],
    quiz: [
      {
        question: 'Which one is a need?',
        options: ['A video game', 'Lunch', 'A toy car'],
        answerIndex: 1,
        explanation: 'Food is a need — your body can’t go without it.',
      },
      {
        question: 'Which one is a want?',
        options: ['Winter coat', 'Bus ticket to school', 'Candy'],
        answerIndex: 2,
        explanation: 'Candy is a treat — nice to have, but not a must.',
      },
      {
        question: 'What should you cover first?',
        options: ['Needs', 'Wants', 'Whatever is on sale'],
        answerIndex: 0,
        explanation: 'Needs come first; wants can wait until needs are covered.',
      },
    ],
  },
  {
    id: 'saving-for-a-goal',
    title: 'Saving for a goal',
    emoji: '🎯',
    minutes: 4,
    summary: 'How pots help you save for something big.',
    pages: [
      {
        emoji: '🚲',
        title: 'Pick a goal',
        body: 'Saving is easier when you know what it’s for. A new bike, a console, a holiday treat — give your pot a name and a target.',
      },
      {
        emoji: '🧮',
        title: 'Make a plan',
        body: 'If a bike costs $100 and you save $10 a week, it takes 10 weeks. Saving a little every week adds up fast!',
      },
      {
        emoji: '⏳',
        title: 'Waiting pays off',
        body: 'Spending everything now means nothing for later. Waiting for something you really want feels amazing when you finally get it.',
      },
    ],
    quiz: [
      {
        question: 'A $60 art set. You save $5 a week. How many weeks?',
        options: ['6 weeks', '12 weeks', '30 weeks'],
        answerIndex: 1,
        explanation: '$60 ÷ $5 = 12 weeks.',
      },
      {
        question: 'What makes saving easier?',
        options: ['Having a clear goal', 'Hiding your card', 'Never looking at your pots'],
        answerIndex: 0,
        explanation: 'A named goal with a target keeps you motivated.',
      },
      {
        question: 'Saving a little every week…',
        options: ['Doesn’t matter', 'Adds up over time', 'Is only for grown-ups'],
        answerIndex: 1,
        explanation: 'Small amounts add up — that’s the magic of saving.',
      },
    ],
  },
  {
    id: 'how-cards-work',
    title: 'How cards work',
    emoji: '💳',
    minutes: 3,
    summary: 'What happens when you tap your Purchase Card.',
    pages: [
      {
        emoji: '💳',
        title: 'Your Purchase Card',
        body: 'Your card is linked to your spending pot. When you buy something, the money comes straight out of that pot.',
      },
      {
        emoji: '🚦',
        title: 'Limits keep you safe',
        body: 'Your grown-up can set a daily limit and freeze the card if it gets lost. If a payment is declined, it might be the limit or not enough money.',
      },
      {
        emoji: '🌍',
        title: 'Watch out for fees',
        body: 'Buying from shops in other countries can add a small extra charge called a foreign transaction fee. Fees are money you don’t get anything for!',
      },
    ],
    quiz: [
      {
        question: 'Where does card money come from?',
        options: ['Your spending pot', 'The shop', 'Nowhere — it’s free'],
        answerIndex: 0,
        explanation: 'Every card payment comes out of your spending pot.',
      },
      {
        question: 'Your card was declined. Why might that be?',
        options: ['The card is tired', 'Daily limit or not enough money', 'It’s raining'],
        answerIndex: 1,
        explanation: 'Declines usually mean a limit was reached or the pot is too low.',
      },
      {
        question: 'What is a fee?',
        options: ['A free gift', 'An extra charge', 'A type of pot'],
        answerIndex: 1,
        explanation: 'A fee is an extra charge — it’s smart to avoid them.',
      },
    ],
  },
  {
    id: 'earning-money',
    title: 'Earning money',
    emoji: '🧹',
    minutes: 3,
    summary: 'Chores, challenges and allowance.',
    pages: [
      {
        emoji: '🧹',
        title: 'Effort earns rewards',
        body: 'Grown-ups earn money by working. You can earn by finishing challenges like tidying your room or walking the dog.',
      },
      {
        emoji: '📅',
        title: 'Allowance',
        body: 'An allowance is money you get regularly — like every week. It’s a great way to practise planning and saving.',
      },
      {
        emoji: '⚡️',
        title: 'Keep your streak',
        body: 'Finish at least one challenge every week to build your streak. Streaks show you’re building great habits!',
      },
    ],
    quiz: [
      {
        question: 'What is an allowance?',
        options: ['Money you get regularly', 'A type of fee', 'A savings goal'],
        answerIndex: 0,
        explanation: 'An allowance arrives on a schedule, like every Saturday.',
      },
      {
        question: 'How do you keep a streak going?',
        options: ['Spend every day', 'Finish a challenge every week', 'Check the app once'],
        answerIndex: 1,
        explanation: 'One finished challenge a week keeps the streak alive.',
      },
      {
        question: 'How do grown-ups usually earn money?',
        options: ['By working', 'By waiting', 'By wishing'],
        answerIndex: 0,
        explanation: 'Working — and you can practise with challenges!',
      },
    ],
  },
  {
    id: 'sharing-and-giving',
    title: 'Sharing & giving',
    emoji: '🎁',
    minutes: 3,
    summary: 'Using money to help friends and others.',
    pages: [
      {
        emoji: '🍕',
        title: 'Splitting the bill',
        body: 'When friends share a pizza, everyone can pay their part. Sending money to a friend is a fair way to split costs.',
      },
      {
        emoji: '🙋',
        title: 'Ask before you send',
        body: 'In FlexFund Kids, a grown-up approves money you send or ask for. Always double-check the name and amount!',
      },
      {
        emoji: '💖',
        title: 'Giving feels good',
        body: 'Many people set aside a little money to give — a birthday gift, or helping a cause they care about.',
      },
    ],
    quiz: [
      {
        question: 'Before sending money, you should check…',
        options: ['The name and amount', 'The weather', 'Your high score'],
        answerIndex: 0,
        explanation: 'Always confirm who you’re paying and how much.',
      },
      {
        question: 'Who approves money you send in FlexFund Kids?',
        options: ['Nobody', 'A grown-up', 'Your friend'],
        answerIndex: 1,
        explanation: 'A grown-up approves every send or ask request.',
      },
      {
        question: 'Splitting a pizza bill means…',
        options: ['One person pays for all', 'Everyone pays their part', 'Nobody pays'],
        answerIndex: 1,
        explanation: 'Splitting means sharing the cost fairly.',
      },
    ],
  },
];

export function findLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

/** Public view of a lesson for the kid app: no answers. */
export function publicLesson(lesson: Lesson) {
  return {
    id: lesson.id,
    title: lesson.title,
    emoji: lesson.emoji,
    minutes: lesson.minutes,
    summary: lesson.summary,
    pages: lesson.pages,
    quiz: lesson.quiz.map((q) => ({ question: q.question, options: q.options })),
  };
}

export function gradeLesson(lesson: Lesson, answers: number[]) {
  const results = lesson.quiz.map((q, i) => ({
    question: q.question,
    selectedIndex: answers[i] ?? -1,
    correctIndex: q.answerIndex,
    correct: answers[i] === q.answerIndex,
    explanation: q.explanation,
  }));
  const score = results.filter((r) => r.correct).length;
  const total = lesson.quiz.length;
  return { score, total, passed: score / total >= PASS_RATIO, results };
}
