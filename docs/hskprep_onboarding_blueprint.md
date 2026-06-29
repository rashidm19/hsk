# HSKPrep — Onboarding Blueprint

Спецификация онбординга для существующего продукта **hskprep.cc**. Описывает, *каким должен быть* онбординг: экраны, поведение, логику и копирайт. **Технические решения (фреймворки, хранение, платёжная интеграция, провайдеры входа) — на стороне реализующего агента.**

Модель смоделирована по проверенному рынком онбордингу **ielts.gg** (прямой конкурент-аналог), адаптирована под HSK.
Тексты экранов — на английском (язык продукта). Пояснения и заметки — на русском.

> **Плейсхолдеры.** Все значения в `{фигурных скобках}` (число учеников, рейтинг, отзывы, логотипы школ, pass rate, starter-kit и т.п.) — заглушки под реальный контент. Агент делает их как placeholder’ы и **не выдумывает значения**.

---

## 0. Контекст

- **Модель:** hard paywall, freemium НЕТ. Вся текущая бесплатка уходит под paywall (репозиционирование лендинга под платную модель — отдельная задача, вне этого ТЗ).
- **Порядок:** `quiz → email-gate → reveal (growth-кривая) → value-stack → wheel → paywall → checkout → exit-intent`. Подтверждён рынком: так у ielts.gg.
- **Платформа и принципы:** веб-продукт, mobile-first / адаптив, визуально консистентен с текущим брендом. Из ielts.gg берём **структуру и психологию шагов**, не визуальное оформление.
- **Дифференциатор vs ielts.gg:** у них чистый self-report. У нас — **реальная мини-диагностика** (Screen 13), опирающаяся на уже существующий в продукте авто-скоринг. Даёт настоящий результат → growth-кривая честная.
- **Уровни:** живой контент — только HSK 4. Вопрос про target-уровень фиксируется и отражается в персонализирующем копирайте, но поток одинаков для любого выбора (включая HSK 5/6).

---

## 1. Решения по механикам (что строим)

| Механика | Решение | Как делаем |
|----------|---------|------------|
| Счётчик шагов | Берём | Число на счётчике = реальному числу шагов (без накрутки). |
| Цифры (юзеры, pass rate) | Берём | Placeholder’ы, в подаче как у ielts.gg. |
| Отзывы | Берём | Placeholder-карточки. |
| Authority | Берём | Офиц. источники Hanban (реальны) + placeholder-логотипы школ. |
| **Колесо скидки** | **Всегда 50%, с «you won»** | Результат всегда 50%; скидка закрепляется и переносится в checkout. |
| **Таймер** | ielts.gg-стиль | 10:00 urgency-отсчёт; цена постоянна (см. S23). |
| Тикер покупок | **Убран** | — |
| Checkout-модалка | Берём 1:1 | Честная, вкл. обязательное раскрытие авто-продления (S24). |
| Exit-intent | Берём | Та же скидка + гарантия, **не глубже** (S25). |
| Цены | ielts.gg | 1mo $77.99 / 3mo $107.99 / 12mo $299.99. 50% уже в ценах. Биллинг — USD. |

---

## 2. Последовательность экранов

| # | Экран | Статус |
|---|-------|--------|
| 0 | Welcome + соцпруф-бейдж | required |
| 1 | Соцпруф (отзывы) | recommended |
| 2 | Goal: зачем тебе HSK | required |
| 3 | Target HSK level | required |
| 4 | Authority/метод #1 | recommended |
| 5 | Первый раз на HSK? | required |
| 6 | Поддержка/соцпруф | recommended |
| 7 | Какая секция тормозит | required |
| 8 | Боли (multi) | required |
| 9 | Дедлайн экзамена | required |
| 10 | Authority/trust #2 | recommended |
| 11 | Время на учёбу в день | required |
| 12 | Fear: что больше всего пугает | required |
| 13 | **Диагностика (5 вопросов)** | required |
| 14 | Processing | required |
| 15 | Зеркало «мы знаем, что тебе нужно» | required |
| 16 | Имя (skip) | optional |
| 17 | **Email-gate / account (один шаг)** | required |
| 18 | **Growth-кривая (reveal)** | required |
| 19 | Таймлайн «что тебя ждёт» | required |
| 20 | Value-stack «что входит» | required |
| 21 | **Discount wheel** | required |
| 22 | **Paywall (3-tier + timer)** | required |
| 23 | **Checkout modal** | required |
| 24 | **Exit-intent offer** | required |
| 25 | **Post-payment success / handoff** | required |

> **Динамические значения.** `{target_level}`, `{diagnostic_result}`, `{weak_section}`, `{daily_time}`, `{name}` — подстановки из ответов пользователя, не литералы. Не хардкодить.

---

## 3. Экраны (copy на EN)

### Screen 0 — Welcome `[required]`
*Хук + соцпруф сразу. Никакого auth.*
- **Headline:** Pass HSK on your first try.
- **Sub:** Take a quick assessment — get a personalized plan built from your real weak spots.
- **Social badge:** ⭐ 5.0 · Trusted by {learner_count} learners
- **CTA:** Start free assessment

### Screen 1 — Social proof `[recommended]`
*«Другие уже справились».*
- 2 отзыва (имя + короткий текст): {testimonial_1}, {testimonial_2}. Затем строка: And thousands more passing HSK with us.
- **CTA:** Continue

### Screen 2 — Goal `[required]`
*Самоидентификация → инвестиция.*
- **Headline:** Why are you taking HSK?
- **Sub:** Choose your main goal
- **Options (single):** 🎓 University in China · 💰 Scholarship (CSC) · 💼 Job / Work visa · 📋 Graduation requirement · 🌏 Personal goal

### Screen 3 — Target HSK level `[required]`
*Фиксируем выбор для персонализации. Поток одинаков для любого уровня.*
- **Headline:** Which HSK level are you aiming for?
- **Options (single):** HSK 3 · **HSK 4** *(recommended)* · HSK 5 · HSK 6

### Screen 4 — Authority / method `[recommended]`
*Снимаем «это вообще легитимно?».*
- **Headline:** Built on the official HSK standard
- **Bullets:** Aligned with the 2026 HSK 3.0 syllabus · Real Hanban exam papers (H41220, H41221) with original audio · Auto-scored instant feedback on every mock
- **Logos (placeholder):** {authority_logos}

### Screen 5 — First HSK? `[required]`
*Помогает настроить подачу диагностики (Screen 13).*
- **Headline:** Is this your first HSK?
- **Sub:** This helps us tailor your plan
- **Options (single):** First time · Taken a mock · Taken the real HSK

### Screen 6 — Encouragement / social proof `[recommended]`
- **Headline:** Great — you've taken the first step.
- **Sub:** {learner_count} learners have reached the same level with us. Now it's your turn.
- **CTA:** Continue

### Screen 7 — Which section holds you back `[required]`
*HSK секции: 听力/阅读/书写. Speaking в HSK НЕТ (HSKK — отдельный тест).*
- **Headline:** Which section holds you back most?
- **Sub:** We'll build your plan around fixing it
- **Options (single):** 🎧 Listening (听力) · 📖 Reading (阅读) · ✍️ Writing (书写)

### Screen 8 — Pain points `[required]`
*Гранулярные боли HSK → топливо для зеркала и плана.*
- **Headline:** What trips you up most?
- **Options (multi):**
  - Tones — I can't hear or produce them reliably
  - Characters (汉字) — I forget them fast
  - Confusable words (他/她/它, 在/再, 的/得/地)
  - Listening speed — natives are too fast
  - Running out of time on reading
  - Vocabulary gaps
  - No structured plan
  - Failed HSK before

### Screen 9 — Exam date `[required]`
- **Headline:** When do you plan to take HSK?
- **Options (single):** Less than a month · 1–3 months · 3–6 months · No date yet

### Screen 10 — Authority / trust `[recommended]`
*Второй authority-слой перед серединой воронки.*
- **Bullets (icon rows):** 📄 Official Hanban exam papers · 🤖 Instant auto-scoring on all 46 mocks · 🎓 Built by HSK 6 / native-level experts
- **Stat (placeholder):** {pass_rate} first-try pass rate
- **As seen in / endorsed by (placeholder):** {authority_logos}

### Screen 11 — Daily study time `[required]`
- **Headline:** How much time can you study daily?
- **Sub:** We'll adapt your plan
- **Options (single):** 15 min — Quick drills · 30 min — One section · 1 hour — Full practice · 2+ hours — Intensive

### Screen 12 — Fear `[required]`
*Майнинг страха. «Wasting money» заранее пере-фреймит покупку как защиту.*
- **Headline:** What worries you most?
- **Sub:** Be honest — it helps
- **Options (single):** 😰 Failing the exam · 💸 Wasting money · ⏳ Running out of time · 😶‍🌫️ Losing motivation

### Screen 13 — Diagnostic `[required]` ← ДИФФЕРЕНЦИАТОР + делает growth-кривую честной
*Реальные вопросы, реальный авто-скоринг. Пользователь ДЕЛАЕТ → получает настоящий результат.*
- **Headline:** Answer 5 quick questions — we'll estimate your level.
- **Состав:** 1 listening · 2 reading/grammar · 1 confusable-word · 1 vocabulary. Подача — с оглядкой на ответ Screen 5.
- **UX:** прогресс "2 of 5", без логина.
- **Требование:** оценка опирается на **существующий в продукте авто-скоринг**, а не на новую логику. Результат `{diagnostic_result}` — это **метка уровня HSK** (напр. «HSK 3.4»); шкала сопоставления баллов в уровень — на усмотрение агента.

### Screen 14 — Processing `[required]`
- **Copy:** Analyzing your answers and building your plan…
- Показывать до готовности результата (минимум ~1 сек), затем авто-переход.

### Screen 15 — Mirror `[required]`
*Отражаем ответы. Результат — РЕАЛЬНЫЙ, из диагностики.*
- **Headline:** We already know what you need
- **Summary card:** Goal: {target_level} · You now: {diagnostic_result} · Weak spot: {weak_section} · Time/day: {daily_time}
- **Testimonial:** {testimonial}
- **CTA:** Continue

### Screen 16 — Name `[optional]`
- **Headline:** What's your name?
- **Sub:** To personalize your plan
- Поле + **Skip** + Continue.

### Screen 17 — Email-gate / account `[required]`
*Один шаг авторизации (как у ielts.gg): захват email на пике любопытства = и есть аккаунт. Отдельного экрана создания аккаунта нет.*
- **Headline:** Your plan is ready to unlock
- **Sub:** Enter your email to open it and save your progress.
- Поле email · trust-строка: Your data is safe. Results sent to your email. · кнопка Show my plan · OR · опция быстрого входа
- Бонус-крючок: Get your free HSK starter kit. (ассет — placeholder)

### Screen 18 — Growth curve (reveal) `[required]` ← самый копируемый экран жанра
*Визуализация пути на пике желания. Старт кривой = РЕАЛЬНЫЙ результат диагностики.*
- **Headline:** Your path to {target_level} — mapped
- **Sub:** We've analyzed your answers and built a personalized path to your goal.
- **Viz:** растущая кривая `{diagnostic_result} (now) → {target_level} (target)` с подписанными точками. Старт — из Screen 13, не хардкод. Подпись — «projected path».
- **CTA:** Continue

### Screen 19 — Timeline `[required]`
*«Что тебя ждёт» — переиспользуем готовый 8-недельный план.*
- **Headline:** What you can expect
- **Steps:**
  - Day 1 — Starting point. Pinpoint your exact level and strengths.
  - Week 1 — Format. Master the structure of every section and exam traps.
  - Week 2 — Level up. Close gaps and sharpen your strategy.
  - Week 4 — Score boost. Visibly improve your weakest section.
  - Week 8 — Take HSK. Walk in confident and hit your target.
- **CTA:** Continue

### Screen 20 — Value stack `[required]`
*Накопить ценность ДО цены. Реальные фичи.*
- **Headline:** Your plan includes:
- **Rows:**
  - 46 full HSK mock exams — Listening, Reading, Writing. Real exam conditions, auto-scored.
  - Step-by-step plan to your target — always know exactly what to study next.
  - 1,000-word vocabulary + 14 grammar topics + confusable-word drills.
- **Guarantee (green):** **Pass guarantee** — Finish your plan and if you don't pass HSK, get a full refund.
  - *Terms (за «Terms apply» / на странице условий):* To qualify, complete at least **90% of your assigned plan** during your subscription, sit the **official HSK within 60 days** of finishing, and submit your **official score report**. Refund covers the subscription price paid. Not valid if the plan isn't completed or the official exam isn't taken.
  - 🔧 Порог/окно (90% / 60 дней) — рабочие значения, меняются одним местом. Гарантия привязана к **доказуемому усилию + внешнему результату** (а не к «не понравилось») — это защищает от refund-магнита.
- **CTA:** Continue

### Screen 21 — Discount wheel `[required]`
*Геймифицированный reveal скидки. Зарешано на 50%, фрейм «ты выиграл».*
- **Headline:** Spin & unlock your personal HSK plan!
- **Sub:** Don't miss your chance to master HSK with a personalized offer 🎁
- **Wheel:** сегменты 10/15/20/30/40/**50%**; кнопка **SPIN**; «Good luck…» во время вращения.
- **Outcome (всегда 50%):** Woo hoo! 🎉 — You won a discount — **50% off** — It will be applied automatically.
- **CTA:** Claim my discount → Screen 22 со скидкой.
- 🔧 **Поведение:** результат всегда 50%; скидка закрепляется за пользователем и переносится в checkout.

### Screen 22 — Paywall (hard, 3-tier, timer) `[required]`
*Жёсткий гейт. Без подписки доступа нет.*
- **Header bar:** Special discount: **50%** · ⏳ 10:00 countdown.
- **Headline:** Start your {target_level} plan today
- **Subtag:** Reach {target_level} on your first attempt
- **Goal/Target chips:** Goal: {target_level} · Focus: {weak_section}
- **Aspirational cert:** макет офиц. HSK score report с целевым баллом (помечен как пример).
- **Social proof:** {n} learners started this week (агрегат, без имён).
- **Pricing (3-tier, $/день, скидка применена, средний = MOST POPULAR):**
  - 1 month — ~~$155.98~~ $77.99 (~$2.60/day)
  - **3 months — MOST POPULAR — ~~$215.98~~ $107.99 (~$1.20/day)**
  - 12 months — ~~$599.98~~ $299.99 (~$0.82/day, best value)
  - ⚠️ Скидка 50% уже зашита в текущие цены (зачёркнутая = base, текущая = после колеса). **На checkout повторно НЕ применять** — иначе двойное списание.
- **Risk-reversal:** No commitment. Cancel anytime. + гарантия (условия — см. S20).
- **Trust:** значки безопасной оплаты / принимаемые карты.
- **CTA:** Get my plan → открывает Screen 23.
- 🔧 **Timer:** 10:00 отсчёт (urgency). Просто **рефрешится** — сбрасывается на 10:00 при загрузке/истечении. Реального снятия скидки нет, цена постоянна (колесо всегда даёт 50%, цены уже со скидкой).

### Screen 23 — Checkout modal `[required]`
*Лучший экран воронки. Всё корректно — переносим 1:1.*
- **Selected plan:** 3 Months · $1.20/day · **Change**
- **Total due today:** $107.99 · Show details ▾
- **Country select:** (для налогов/локали) — default по гео.
- **Payment method:** карты. Note: You'll enter your card details in a secure window after clicking. + Final amount may vary due to your bank's exchange rate.
- **Trust:** Secure checkout.
- **CTA:** Subscribe · $107.99 → переход к оплате.
- ✅ **Subscription disclosure (обязательно, дословно под выбранный план):** Your card will be charged **$107.99 today** for the 3-month plan, then **$107.99 every 3 months** until you cancel. Cancel anytime in your account settings — it stops your next renewal. By subscribing you accept our Terms, Privacy Policy, and Refund Policy.
  - 🔧 Цена и интервал подставляются под выбранный тариф (1/3/12 мес). **Продление — по той же цене** (не по зачёркнутой base): скидка постоянна, поэтому «intro-цена → задранное продление» не делаем — это и честнее, и убирает классический chargeback-триггер.
- 🔧 На закрытии (X / клик вне модалки) → триггерит Screen 24.

### Screen 24 — Exit-intent offer `[required]`
*Risk-reversal в момент отвала. Не новая скидка — снятие страха.*
- **Icon:** 🎁 (−50% badge)
- **Headline:** Special offer
- **Sub:** We want you to succeed, so here's a discount to try our proven program.
- **Card:** Money-Back Guarantee — We're so confident we offer a full refund. Terms apply. *(условия — см. S20)*
- **Primary CTA:** Get my discount → назад на checkout (Screen 23).
- **Secondary:** No thanks, I'll pass → закрыть.
- ⚠️ **Гайдрейл:** скидка здесь = ТА ЖЕ (50%), **не глубже** headline.

### Screen 25 — Post-payment success / handoff `[required]`
*Краткое подтверждение покупки перед входом в продукт: снимает тревогу и раскаяние, снижает chargeback. Затем — на главный экран платформы.*
- **Headline:** You're in! Your HSK plan is ready.
- **Sub:** Payment confirmed — your receipt is on its way to your email.
- **Recap:** Plan: {plan} · Goal: {target_level} · Focus: {weak_section}
- **What's next:** Your Week 1 starts now — first up: {weak_section}.
- **CTA:** Start studying → главный экран платформы.
- 🔧 Только happy-path. При отмене/ошибке оплаты — не сюда, а назад на checkout (S23) с понятной ошибкой.

---

## 4. Логика и поведение (требования, не реализация)

- **Хранение прогресса.** Ответы квиза сохраняются анонимно до регистрации и переносятся на аккаунт при его создании. Ответы 2–13 питают зеркало (S15), growth-кривую (S18) и план (S19).
- **Диагностика (S13).** Использует существующий авто-скоринг продукта. Отдаёт `{diagnostic_result}` как метку уровня HSK; шкала сопоставления — на усмотрение агента.
- **Growth-кривая (S18).** Левый конец = реальный результат диагностики; правый = цель, подписан как прогноз.
- **Таймлайн/план (S19).** Строится из существующего 8-недельного плана, с акцентом на слабую секцию (S7) и боли (S8).
- **Target-уровень.** Фиксируется и отражается в копирайте; поток одинаков для всех уровней (живой контент — HSK 4, без ветвлений).
- **Колесо (S21).** Исход всегда 50%; скидка закрепляется и переносится в checkout.
- **Таймер (S22).** 10:00 отсчёт; просто рефрешится (сброс на 10:00 при загрузке/истечении); реального снятия скидки нет, цена постоянна.
- **Цены.** 1mo $77.99 / 3mo $107.99 / 12mo $299.99, биллинг USD. Скидка 50% уже в этих ценах — повторно на checkout не применять.
- **Exit-intent (S24).** Триггерится на закрытие checkout; та же скидка + гарантия; не глубже.
- **Тикер покупок.** Не реализуем.
- **Авторизация.** Один шаг (S17): email/быстрый вход = аккаунт. Отдельного экрана создания аккаунта нет.
- **Однократность онбординга.** Показывается только при первом прохождении / явном сбросе; повторный заход ведёт в продукт.
- **После оплаты.** Краткий экран-подтверждение (S25), затем переход на главный экран платформы. При отмене/ошибке оплаты — назад на checkout (S23) с понятной ошибкой.
- **Крайние случаи.** Невалидный email → понятная ошибка; нельзя продолжить без обязательного выбора; назад/правка ответа, влияющего на диагностику/план → пересчёт; возврат с оплаты → обработать успех / отмену / ошибку.
- **Доступность и мобильность.** Mobile-first; корректный перенос фокуса между шагами; «MOST POPULAR» выделять не только цветом; у emoji-опций — текстовые подписи.
- **Контент.** Держать HSK-4-центрично, пока нет других уровней.
