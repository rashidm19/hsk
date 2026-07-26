# Функциональная спецификация платформы HSK Prep (hskprep.cc)

Документ получен реверс-инжинирингом по коду репозитория `hsk` (ветка `claude/dev`, июль 2026). Источник каждого утверждения — код и данные репозитория (ссылки вида `file:line`); там, где намерение из кода не выводится, поведение описано «как есть», а вопрос вынесен в раздел 16. Несколько операционных фактов, которые в коде отсутствуют (хостинг, почтовый провайдер), помечены явно как «вне кода».

## 1. Продукт и бизнес-модель

HSK Prep — B2C-платформа подготовки к экзамену HSK 4 (китайский язык, стандарт HSK 3.0 / 2026): пробные экзамены с автопроверкой, словарь, иероглифы, грамматика, предложения, «ловушки» экзамена и тренажёры. Интерфейс английский, контент двуязычный (EN + 中文). Продукт продаётся как **разовый платёж без автопродления** за доступ на срок: 1 месяц — 7 990 ₸, 3 месяца — 13 990 ₸ (тариф по умолчанию, «MOST POPULAR»), 12 месяцев — 19 990 ₸; валюта — казахстанский тенге (data/onboarding.json:25-33, supabase/PAYMENTS_SETUP.md:56-61). Зачёркнутые «базовые» цены ровно вдвое выше фактических — «скидка 50%» вшита в прайс, а не вычисляется (см. §7.6).

Путь покупателя: маркетинговый лендинг `/` → онбординг-воронка `/quiz/` (26 экранов: анкета → диагностика → email-гейт → пейволл) → внешний эквайринг `pay.studybox.kz` → возврат в воронку → **пост-paywall клиент `/app/`** (SPA, добавлен 2026-07 — см. §5.1). Возвращающиеся пользователи входят через выделенную страницу `/login/` (только существующие аккаунты) и также попадают в `/app/`. Старые статические страницы `/exams/` и разделы остаются для SEO и по-прежнему за клиентским гейтом, но больше не основной пост-paywall UI. Весь платный контент — те же статические страницы, закрытые **клиентским** гейтом «аккаунт + активный entitlement» (см. §8.4 об ограничениях этой модели).

Продукт несёт публичное обещание «Pass guarantee»: полный возврат денег, если пользователь выполнил ≥90% плана и в течение 60 дней после завершения сдал официальный HSK, приложив score report (`guarantee.completionPct: 90`, `windowDays: 60` — data/onboarding.json:38-44). Лендинг дополнительно обещает оплату пересдачи (index.html:697). Страниц с юридическими условиями (/terms/, /privacy/, /refunds/) не существует — ссылки на них в футере и кнопка «Guarantee terms» закомментированы (index.html:701, 787-789), дисклеймер чекаута упоминает их текстом без ссылок.

Наследие проекта: репозиторий начинался как открытый датасет экзаменов (README оформлен как README датасета, лицензия CC BY-NC-SA 4.0 с атрибуцией «HSK Prep (hskprep.cc)»), затем был ребрендирован из «Mandarin Zone» (одноразовые скрипты scripts/rebrand.sh, scripts/fix-rebrand.py) и монетизирован. Из этого наследия остались зафиксированные в коде противоречия: копирайт «Free / no sign-up» на фактически платных страницах, README про «free account» при обязательной подписке, футер-ссылки на публичный GitHub-репозиторий с исходным контентом (см. §16, группа А).

## 2. Архитектура

### 2.1 Технологический стек

Статический сайт **без фреймворка, бандлера и package.json** (в репозитории нет package.json, Dockerfile, CI-конфигов). Node.js используется только для zero-dependency скриптов:

- `build.js` (~5 476 строк) — генератор: читает `data/*.json` и пре-рендерит ~601 HTML-страницу + sitemap.xml (модуль scripts/app-shell.js require'ится из него);
- `scripts/inject-auth.js` — постпроцессор, вшивающий auth-скрипты в платформенные страницы;
- вспомогательные: 11 файлов node-тестов scripts/*.test.js (access-authjs, access-decision, auth-guard, band-score, data-phase2, exam-audio, exam-resume, grade-sections, route-decision, skills-selfcheck, sync-merge; `node --test scripts/*.test.js`), scripts/fix-profile-placeholder.js (одноразовая чистка демо-плейсхолдеров профиля «Alex Chen» из сгенерированных страниц).

Backend — Supabase (auth + Postgres + 2 edge-функции), целиком клиентская интеграция через supabase-js v2 с CDN. Платёжный шлюз — внешний сервис StudyBox (`pay.studybox.kz`, отдельный репозиторий), связанный с платформой вебхуком. Аналитика — Яндекс Метрика (счётчик 110455584).

**Сгенерированный HTML коммитится в репозиторий** — хостинг раздаёт файлы как есть. Отсюда ключевое инженерное требование: повторные сборки обязаны быть побайтно идентичными. Все «случайные» выборки на этапе билда детерминированы (PRNG mulberry32 c сидом-строкой, build.js:100-114), порядок вариантов квизов вычисляется из индексов, `lastmod` — единственный недетерминизм (дата сборки).

Вне кода (операционная память проекта): продакшн-хостинг — DigitalOcean App Platform, авто-деплой ветки `main` репозитория `rashidm19/hsk`; упоминание GitHub Pages в CLAUDE.md и файл CNAME — артефакты прежнего хостинга. Письма OTP отправляет Resend (SMTP Supabase). Supabase-проект — `cksziokdhbzpdybwnjsx` (захардкожен как фолбэк в admin/index.html:126 и как дефолт в scripts/configure-supabase-auth-urls.sh).

### 2.2 Конвейер сборки

`node build.js` выполняет последовательность из ~28 шагов (build.js:5491-5519): 22 контентных генератора → `buildSitemap()` → четыре сквозные инъекции → `syncCounts()`:

1. buildVocabulary → buildTestPages → buildTranscriptPages → buildHomepage → buildQuizFunnel → buildTopics → fixGuide → buildSentenceOrder → buildPictureExamples → addGrammarCrossLinks → buildWritingGuide → buildTaskTopicPages → buildConfusablePages → buildGrammarPatternPages → buildGrammarPatternsHub → buildCharacterPages → buildSentenceCategoryPages → buildTrapCategoryPages → buildMixedPractice → buildCompleteSentence → buildPracticeHub → addTestLinksToHubs;
2. `buildSitemap()` — 1 URL (только публичный лендинг `/`; O5, решение владельца «no freemium» — ~597 гейтированных `body.app` страниц остаются генерируемыми и индексируемыми, но больше не рекламируются в sitemap);
3. `injectTheme()` — no-flash-лоадер тёмной темы первым тегом `<head>` каждой страницы + плавающая кнопка-переключатель (только на страницах с common.css);
4. `injectMetrika()` — сниппет Метрики перед `</head>` (идемпотентно, пропускает ds-bundle);
5. `injectFavicon()` — favicon.png 96×96 + apple-touch-icon;
6. `injectAppShell()` (scripts/app-shell.js) — оборачивает каждую страницу с `<main>` (кроме `body.lp`, корня/404 и **каталога `app/`** — он в SKIP_DIRS, т.к. это рукописный пост-paywall SPA со своим шеллом) в дашборд-шелл: вырезает статический `<header>` шаблона, ставит `body.app`, подключает dashboard.css, shell.js, auth-ui.js;
7. `syncCounts()` — последним, по финальному HTML: приводит все фразы «N mock exams / N questions» к производным константам, **намеренно пропуская quiz/index.html** (у воронки собственная маркетинговая цифра, build.js:1550-1552).

Отдельным ручным шагом запускается `node scripts/inject-auth.js`: в `<head>` каждой страницы с `body.app` (сразу после theme-лоадера) вставляется блок supabase-js CDN → /config/auth.js → /auth.js → /auth-guard.js → /auth-ui.js defer, а в тег body добавляется класс `hsk-auth-pending` (scripts/inject-auth.js:16-21, 76-80). Он не вызывается из build.js — забытый запуск после пересборки оставит новые страницы без гейта.

Три класса страниц по способу сопровождения:

- **полностью генерируемые** (перезаписываются с нуля): test/, topics/{slug}/, words/{slug}/ (кроме 9 custom), grammar/patterns/ (кроме 1 custom), characters/, sentences/{slug}/, traps/{slug}/, practice/, train/, writing/complete-sentence/, quiz/;
- **рукописные, но патчащиеся билдом по маркерам**: хабы (exams/, topics/, words/, sentences/, traps/), vocabulary/, writing/, writing/sentence-order/, guide/, strategies/picture-templates/ — билд идемпотентно врезает/заменяет блоки между HTML-маркерами;
- **полностью рукописные**: корневой index.html + landing.js/landing.css, **app/ (пост-paywall SPA — app/index.html + app/*.js; injectAppShell path-skips app/ через SKIP_DIRS, но inject-auth врезает auth-блок, т.к. body.app — после правок нужен inject-auth)**, login/, admin/, auth/callback.html, 404.html, compare/ (4 страницы), strategies/ (хаб + 9), writing/paragraph/ — билд трогает их только сквозными инъекциями.

### 2.3 Производные константы и синхронизация счётчиков

`TEST_COUNT` (=14) и `TOTAL_QUESTIONS` (=1 375) выводятся из data/index.json (build.js:36-37) и не хардкодятся; syncCounts() распространяет их по всем страницам. При этом ряд счётчиков в шаблонах остаётся литералами и **не** синхронизируется: «43 confusable pairs» (при 44 в данных, build.js:761, 880, 1628), «156 questions» тренажёра (build.js:4870), «14 grammar topics» (build.js:2680), «31 Topics / 77 Sub-topics» в hero хаба тем — см. §16.В.

### 2.4 Локальная разработка

`python3 -m http.server 8080` из корня. Конфиг auth — `config/auth.js` (копия config/auth.example.js: `url`, `anonKey`, `siteUrl`). Пока в конфиге плейсхолдеры, `HSKAuth.isConfigured()` возвращает false и **весь сайт открыт**: auth-guard выходит первой строкой (auth-guard.js:9), /login/ показывает карточку «Local preview» с кнопкой в /app/, воронка пропускает email-гейт, а чекаут заменяется симуляцией (см. §9.6). Локальная разработка не требует Supabase. Замечание: файл `config/auth.js` фактически закоммичен в git, хотя README называет его gitignored (§16.Д).

### 2.5 Intent-документация в репозитории

Помимо кода, в репозитории закоммичен слой проектной документации, фиксирующий **намерения** (использован в §16 — часть потенциальных вопросов снята им же):

- `docs/hskprep_onboarding_blueprint.md` (293 строки) — канонический дизайн воронки /quiz/, смоделированный по ielts.gg. Прямо фиксирует как задуманное: колесо «всегда 50%», таймер «просто рефрешится — реального снятия скидки нет, цена постоянна», «скидка 50% уже зашита в цены — на checkout повторно НЕ применять», готовый текст условий гарантии (≥90% плана / 60 дней / score report; «привязана к доказуемому усилию + внешнему результату — защита от refund-магнита»), пометку «Example» на макете сертификата.
- `docs/studybox-payment-integration.md` (312 строк) — контрактная спецификация для команды StudyBox (внешняя половина платёжного контура): роли сторон (StudyBox не пишет в БД HSK и не получает service-role key; браузерный redirect — «UX only», entitlement даёт только верифицированный server-to-server вызов), wire-контракт grant-entitlement, требования к странице /checkout.
- `docs/superpowers/plans/` (4 плана: payment-integration и yandex-metrica закоммичены, dedicated-login-flow и passwordless-provisioning — untracked, см. §16.Д) и `docs/superpowers/specs/` (3 design-спеки: payment-integration, landing-funnel-auth-unification, yandex-metrica).
- `supabase/PAYMENTS_SETUP.md` — операционный runbook платежей; README.md, CLAUDE.md — рабочие инструкции (частично устаревшие, §16.Д); CONTENT_PLAN.md / PROMO.md / INTERNAL_LINKING.md — контент-стратегия, не код.

## 3. Модель данных (data/*.json)

Единственный источник контента. Всё читается билдом; `vocabulary.json` и `topics.json` дополнительно фетчатся клиентом в рантайме (т.е. фактически публичный API; robots.txt закрывает /data/ от индексации, но не от скачивания).

| Файл | Объём | Содержимое и потребители |
|---|---|---|
| index.json | 14 записей | манифест экзаменов `{file, title, questions, official?}`; порядок задаёт URL /test/NN/; official:true — только test-13/14 |
| test-NN.json | 14 файлов | экзамены; схема вопроса: `number, original_id?, type, audio?, image?, text?, options[], correct_answer_index (0-based), explanation?, note?, transcript?`; у test-13/14 корневой `listening_audio` (единый mp3-трек) |
| vocabulary.json | ровно 1000 слов | `{id (1001–2000), word, pinyin, pos, meaning, example_cn, example_pinyin, example_en}` |
| hsk4-characters.json | 150 | письменные иероглифы 书写 `{char, pinyin, meaning}` |
| hsk4-rendu-characters.json | 291 | «на распознавание» 认读; билд проставляет `tier:'recognition'` |
| character-data.json | 236 ключей | сабсет Make Me a Hanzi: definition, pinyin[], radical, decomposition (IDS), etymology — только для «расширенных» топ-30 страниц |
| official-characters.json | rendu 441 / shuxie 150 | официальный эталон; **не читается ни одним скриптом** (rendu − shuxie = в точности 291 rendu-файла) |
| confusables.json | 44 пары | slug, wordA/B, category, rows[], exA/exB, tip, quiz×3 (2 варианта), exercises×3 (у jingran-juran — 7), customHtml? (9 пар) |
| grammar-patterns.json | 8 паттернов | pattern_cn/en, structure, examples×5, wrong_examples×2, quiz×3, exercises×3, compare_with, customHtml? (1) |
| sentences.json | 10 категорий × 10 | модельные предложения `{cn, py, en, use}` |
| topics.json | 31 тема в 7 категориях | hierarchy + topic_words (33 ключа, 2 «скрытых» темы) + word_topics (607) + stats (605 классифицировано); генерируется scripts/classify_topics.py, но правился вручную — перезапуск скрипта затрёт правки (§16.В) |
| traps.json | 7 категорий, 15 ловушек | контент хранится **готовым HTML** (поля html, quiz_html с inline-onclick) |
| task-dialogues.json | 30 диалогов | сценарные диалоги 情景对话 по 5–6 реплик, ключи = слаги 30 задач |
| onboarding.json | 26 экранов | весь конфиг воронки: копирайт экранов, тарифы, колесо, таймер, гарантия, levelScale, ссылки диагностики (§7) |

Типы вопросов экзамена (7 объявлено, 6 фактически встречаются): listening_true_false (对/错), listening_choice, fill_in_blank (банк слов A–E), reading_ordering (перестановки трёх предложений), reading_comprehension, writing_construction; тип `choice` объявлен в маппингах и README, но не встречается ни в одном файле данных. writing_construction (всего 210 вопросов = 14×15) неоднороден по форме options: 完成句子 (Q86–95) — выбор из вариантов-перестановок, где правильный указан `correct_answer_index` (0–3); 看图造句 (Q96–100) — набор образцовых предложений с одним отмеченным как правильный (в test-01 их от 8 до 25, в официальных test-13/14 — по одному). Плеер везде оценивает по `correct_answer_index` (exams/index.html:1252), а не по options[0]. Отклонения: test-04 — 99 вопросов, test-07 — 76 (без TF и comprehension). `explanation` (англоязычные разборы) есть только у test-01 (55 шт.).

**Внешние медиа-зависимости.** Тесты 01–12: 509 аудио-URL на `https://media.mandarinzone.com` (WordPress прежнего бренда) и 45 картинок на `http://www.mandarinzone.com` — обычный HTTP, на HTTPS-сайте это mixed content. Официальные тесты 13–14 самодостаточны: локальный mp3 (~24 МБ на тест, закоммичен) + transcript в JSON + локальные картинки. build.js внешние URL не переписывает.

**Производный «доказательный» слой.** Билд считает по корпусу всех 14 экзаменов: частоту словарных слов (computeExamFrequency: жадная сегментация, слова ≥2 иероглифов, стоп-лист 26 рубричных слов, порог ≥2 — бейджи «常考 N×» при 6–19 и «高频 N×» при ≥20; фактически 471 слово с частотой ≥2), аутентичные примеры-предложения к словам (extractExamSentences: 8–34 символа, без латиницы/цифр; покрыто 378 слов) и частоту иероглифов (computeCharFrequency — сортировка «Most seen in exams» на хабе иероглифов).

## 4. Контентная платформа

Все разделы ниже (кроме явно отмеченных) — страницы `body.app`: дашборд-шелл + auth/subscription-гейт. Собственных целей аналитики контентные страницы не шлют.

### 4.1 Пробные экзамены

Три поверхности:

**Статические страницы /test/NN/** (14 шт.) — «весь тест на одной странице» для SEO: вопросы сгруппированы по типам, ответы и транскрипты спрятаны за `<details>` (полный ключ ответов присутствует в HTML), у официальных бумаг — единый аудиоплеер в начале Listening-секции. Бейдж «Complete Mock» (все 14 тестов содержат writing); для неполных — дисклеймер «partial test with N questions». Кнопка «Start Interactive Test» → `/exams/?start={i}` (0-based индекс). JSON-LD `Quiz` с hasPart из 3 секций и `isAccessibleForFree: true` — при фактическом гейте (§16.Б).

**Интерактивный плеер /exams/** (рукописный exams/index.html, билд патчит только noscript-список и SEO-блок) — ядро продукта:

- три экрана: сетка тестов (карточки со статусом «In progress · X/Y» или «Last score N%»), экран вопроса, экран результатов; deep-link `?start=N` автостартует тест и вычищается из URL;
- рендер вопроса: прогресс «i/total», бейдж типа, флаг «Flag for review», навигатор-сетка всех вопросов (Answered/Flagged/Current/Unanswered), клавиатура: 1–9/A–E — ответ, ←/→ — навигация, F — флаг;
- аудио: приоритет поклипового `q.audio` над единым треком `listening_audio` (src единого трека не переустанавливается при навигации, чтобы не сбрасывать позицию). В трёх тестах есть вопросы аудио-пар без собственного поля audio (test-01: Q37/39/41/43/45, test-03: Q41, test-07: Q42–45 — всего 10 вопросов) — на них аудиоблок не показывается вовсе;
- таймер считает **вверх** без лимита (реальный экзамен ~105 минут — обратного отсчёта нет), тап — пауза; автосейв прогресса каждые 10 секунд и на beforeunload;
- persistence: `hsk4_progress_{i}` = `{answers, flags, currentQ, elapsed, ts}` — при повторном входе модалка Resume/Start over; `hsk4_result_{i}` = `{pct, correct, total, ts}` — последний результат (прогресс-ключ удаляется при показе результата); все обращения к localStorage в try/catch;
- результаты: порог прохождения **60%** («恭喜通过! / 继续加油!»), плитки Correct/Wrong/Skipped/Time, посекционные полосы, блок «Your next step»: карточка слабейшей секции (при точности <80%; Listening/Reading → профильная стратегия, Writing → /sentences/), карточка словаря, карточка следующего теста; review-режим «все / только ошибки» с разборами и транскриптами;
- writing_construction рендерится как обычный выбор варианта с проверкой по correct_answer_index; там, где options — набор образцовых ответов с одним отмеченным как правильный (только test-01 Q96-100: 8–25 равноценных образцов), выбор любого другого корректного образца засчитывается ошибкой (§16.В).

Плеер не отправляет ни одной цели Метрики (ymGoal определён, но не вызывается).

**Транскрипты /test/NN/transcript/** (только официальные бумаги: 2 страницы × 45 items) — read-along/shadowing-ресурс: единый аудиотрек + дословный транскрипт каждого вопроса с открытым ответом; части жёстко по номерам: Q1-10 判断对错, Q11-25 短对话, Q26-45 长对话与短文.

Хаб /exams/ несёт статическую SEO-секцию «Complete HSK 4 Toolkit» (карточки всех разделов), таблицу формата экзамена (100 вопросов, ~105 минут, порог 180/300) и 8-недельный план. Canonical в `<head>` этого файла до сих пор указывает на старый домен (§13.2).

### 4.2 Словарь (/vocabulary/)

Одна страница, 1000 слов. Статический пре-рендер всех карточек для краулеров + клиентский рендер из fetch. Карточка: слово, пиньинь, POS, частотный бейдж (высокочастотное/常考), пример, чип-ссылка на тему, блок «真题例句 · from a mock exam». Фильтры: POS-пилюли, режимы all/unmastered/mastered, поиск, сортировка «Most tested first 🔥», пагинация по 50. Прогресс: чекбокс «Mastered» → localStorage `hsk4-vocab-mastered` (массив id). Два режима практики: Flashcards (tap-to-reveal, «I know this» помечает mastered) и Quiz (20 вопросов × 4 варианта).

### 4.3 Иероглифы (/characters/)

442 файла: хаб + 150 письменных + 291 «на распознавание». Хаб: сетка 150 карточек с поиском (иероглиф/пиньинь без диакритики) и сортировками (default / pinyin / «Most seen in exams 🔥» по data-freq); блок 291 认读字 — отдельная нефильтруемая сетка. Детальные страницы трёх шаблонов: топ-30 письменных по «плотности» в словаре — расширенный (Quick Answer, декомпозиция по IDS-операторам из character-data.json, радикал с кросс-ссылками, этимология, FAQ+FAQPage), остальные 120 — базовый, 291 recognition — базовый с баннером «handwriting not required». На всех 441: интерактивная пропись hanzi-writer@3.7 с CDN (Animate/Practice/Reset, подсказка после 2 промахов), до 8 слов с этим иероглифом, до 4 связанных задач-тем, кольцевой пейджер внутри своего яруса.

Особенность пост-обработки: детальные страницы иероглифов вшивают сайдбар прямо в шаблон, но body остаётся без класса `app` — injectAppShell их пропускает, dashboard.css не подключается, анти-flash класс не ставится, при этом auth-guard подключён и срабатывает (§16.Б).

### 4.4 Грамматика (/grammar/)

Три слоя: (а) 11 рукописных тематических страниц (把字句, 被动句, 比较句 и т.д.) — билд пересоздаёт на них блок перекрёстных ссылок seo-cross-links (стратегия + паттерны + практика); (б) 8 страниц паттернов /grammar/patterns/{slug}/ (7 генерируются, buguan-dou — customHtml, не перегенерируется): формула, 5 примеров, 2 «частые ошибки ✗/✓», бокс «Easily confused» с мостом в /words/, 3 fill-упражнения, квиз 3×2, до 2 реальных вопросов из тестов 01–12, FAQ+FAQPage; (в) хаб /grammar/patterns/ (создан из-за прежнего 404 по URL). Проверка fill-упражнений на грамматике засчитывает **любой префикс** правильного ответа (задумано для составных «不管...都», побочно — один первый иероглиф уже «Correct», §16.В).

### 4.5 Похожие слова (/words/)

44 страницы пар + хаб. Страница пары: сравнительная таблица rows (ячейки вставляются без экранирования — данные вправе нести разметку), примеры, «Quick rule», 3 fill-упражнения (строгая проверка `val === ans`), квиз 3×2 (порядок вариантов детерминирован чётностью индексов), до 2 реальных вопросов из тестов 01–12, FAQ×3+FAQPage, related-блок (скоринг: 10×общие иероглифы + 1 за категорию), prev/next. 9 пар с customHtml не перегенерируются — билд обновляет только related-блок между маркерами; изменения общего шаблона до них не доходят. Поле wordC поддержано кодом хаба, но отсутствует у всех записей — «тройки» живут только в slug/subtitle.

### 4.6 Предложения (/sentences/)

10 категорий × 10 предложений. На странице категории: чипы «задействованных паттернов» (regex-детект по справочнику из 21 паттерна), список 10 предложений, отсортированных по эвристике сложности (score = длина + 6×коннекторы + 3×запятые → 1–3★), режим Active Recall (английский виден, 中文 скрыт, per-card и массовый reveal; состояние не сохраняется), related-ссылки, кольцевой prev/next, CTA на мок-экзамены.

### 4.7 Темы (/topics/)

Хаб (рукописный, 7-категорийный аккордеон с fetch данных, поиском с дебаунсом, «скрытым» списком неклассифицированных ~395 слов и модальным квизом «слово → тема») + 30 полностью генерируемых страниц официальных коммуникативных задач. Страница задачи: цитата требования программы 大纲要求, сценарный диалог из task-dialogues.json («Read it aloud twice»), таблица Core Vocabulary (13–96 слов), детерминированный квиз 5×3 (только при ≥8 словах), до 3 реальных вопросов из тестов 01–12 (нужно ≥2 совпадений ключевых слов), 3 FAQ + FAQPage/Article, перекрёстные ссылки (жёстко: Mock Test 01/03/06). Массив TASKS (30 задач, слаги, topic_ids, ссылки на 2 грамматики, навыки) захардкожен в build.js:1705-1946. buildWordTaskMap связывает словарь и задачи «первая задача забирает слово».

### 4.8 Ловушки (/traps/)

7 категорий (A–G), 15 ловушек. Контент — готовый HTML из traps.json (карточка-разбор ✗/✓ + квиз). Квиз однопопыточный, `trapAnswer` подсвечивает и раскрывает объяснение; параметр номера вопроса принимается, но не используется; результат не суммируется.

### 4.9 Письмо (/writing/) и тренажёры

- **/writing/** (хаб, рукописный + патчи билда): описывает формат 2026 (写作: 看图造句 Q65-69 + 写短文 Q70 ≥80 иероглифов). Тренажёр 看图造句: банк ровно 400 слов (каждое второе из первых ~800 позиций словаря — последние ~200 слов в банк не попадают), свободный ввод + «Show model sentence» + чек-лист самопроверки; прогресс в localStorage `hsk4_kt_words`. Тренажёр 写短文: 8 промптов, живой счётчик считает только иероглифы regex-ом [一-鿿], цель ≥80; без сохранения.
- **/writing/sentence-order/**: 10 кураторских + 20 реальных упражнений «собери предложение» (из writing_construction Q86-95 официальных бумаг — задания *старого* формата, на странице есть оговорка); клик-сборка фрагментов, проверка точным совпадением, 4 градации итога.
- **/writing/paragraph/**: полностью рукописная — 4 фреймворка абзаца, 6 челленджей со свободной textarea без проверки.
- **/writing/complete-sentence/** (генерируемая): 61 задание из sentences.json (резка по первой запятой), раунд из 12, reveal + честная самооценка «I got it ✓ / Review ✗» (свободное письмо не автогрейдится — комментарий build.js:4624-4629).
- **/practice/** — Mixed Practice: пул 156 бинарных вопросов (24 грамматика + 132 confusables), раунд 15, фильтры All/Grammar/Confusables, объяснение + ссылка «Full notes →», результат с порогом 60%.
- **/train/** — Practice Center: 4 стат-плитки (Mocks taken, Best score, Words mastered, Study steps x/8), сетка 14 тестов с последними результатами из `hsk4_result_*`, каталог всех тренажёров. Знаменатель «Study steps» вычисляется на билде из data-step в guide/index.html. Важно: карточки тестов ведут на статические /test/NN/, а результаты пишет только плеер /exams/; результаты mixed practice и complete-sentence не сохраняются вовсе, хотя копия хаба обещает «progress saved» (§16.В). Функции перекрещены по именам: buildPracticeHub пишет /train/, buildMixedPractice — /practice/.

### 4.10 Рукописные разделы: Strategies, Guide, Compare

- **/strategies/** — хаб + 9 гайдов по типам заданий (4 listening, 3 reading, writing-construction, picture-templates). В picture-templates билд врезает 10 реальных заданий 看图造句 (Q96-100 официальных бумаг) с картинкой, ключевым словом и официальным 参考答案.
- **/guide/** — «HSK 4 Study Guide 2026»: структура и скоринг экзамена, пороги HSK3→4, 30 задач, чек-лист готовности, порядок изучения, план; 8 отмечаемых шагов пути (localStorage `hsk4-guide-path`). Билд нормализует формулировки fixGuide'ом.
- **/compare/** — хаб + 3 сравнения (HSK4 vs HSK3, vs HSK5, new vs old 2026). Полностью рукописные.

### 4.11 Хранение прогресса (сводка localStorage)

| Ключ | Пишет | Содержимое |
|---|---|---|
| hsk4_theme | все страницы | 'dark' / 'light' |
| hsk4_progress_{i} | плеер экзаменов | незавершённая попытка |
| hsk4_result_{i} | плеер экзаменов | последний результат теста |
| hsk4-vocab-mastered | словарь | массив id освоенных слов |
| hsk4_kt_words | тренажёр 看图造句 | освоенные слова-промпты |
| hsk4-guide-path | гайд | отмеченные шаги плана |

**Кросс-девайс синхронизация (2026-07):** клиент `/app/` union-merge'ит сводный blob прогресса (попытки, освоенные слова, шаги гайда, цель, префы) в `profiles.progress` (jsonb) через `app/sync.js` — gated на auth+session, non-blocking, при сбое откат на локальное хранилище. Старые страницы сайта пишут только локальный localStorage. Namespace `/app/` унифицирован на канонические ключи `hsk4_*`/`hsk4-*` (без прежнего mobile-only `hsk4m-*`), плюс `hsk4-writing-draft` (черновик тренажёра письма). В `profiles` на сервере: `onboarding`, `subscription`, `progress`.

## 5. Дашборд-шелл

Единственный источник навигации — массив NAV из 11 разделов (scripts/app-shell.js:11-23): Mock Exams, Vocabulary, Characters, Grammar, Sentences, Strategies, Topics, Words, Compare, Traps, Guide. Активный пункт — по каталогу; test/, train/, practice/ подсвечивают Mock Exams, writing/ — Grammar. Сайдбар: бренд-ссылка и «Home» ведут на /exams/. Топбар: гамбургер (оверлей ≤900px, shell.js), поле поиска «Search tests, vocabulary…» — **отрисовано с disabled, поиск не реализован**, кнопка темы, виджет профиля (auth-ui.js: мгновенно из sessionStorage-кэша `hsk_profile_cache` TTL 24 ч, затем refresh; меню с единственным пунктом Sign out → редирект на /, failsafe 5 с; гость — «Guest / Sign in to save progress»). shell.js дополнительно префетчит nav-ссылки (mouseenter/idle). Тёмная тема: ключ `hsk4_theme`, сохранённое значение перебивает системную prefers-color-scheme.

### 5.1 Пост-paywall клиент /app/ (основной пост-paywall UI, добавлен 2026-07)

`/app/` — одностраничный клиент (SPA), куда попадает подписчик после воронки/логина: пост-auth роутинг по умолчанию ведёт в `/app/`, не `/exams/` (route-decision.js, auth.js safeNextPath, login.js, funnel handoffUrl в data/onboarding.json → quiz/index.html + onboarding.js). Дашборд-шелл §5 и статические разделы `/exams/` остаются для SEO и по-прежнему за клиентским гейтом, но больше не основной UI.

**Два presentation-шелла, один роут.** Boot-picker в `app/index.html` выбирает mobile (дефолт) или desktop: `(hover:hover)&&(pointer:fine)` ИЛИ `min(screen.width,height) ≥ 700`; ручной оверрайд `localStorage 'hsk4-client'` ('desktop'|'mobile'); решение — только на загрузке. Общие **логические** модули `app/{core,data,shell,exam,vocab,more,study}.js` грузятся для обоих; desktop дополнительно грузит `app/desktop-config.js` (перед модулями) + `app/desktop-{shell,exam,vocab,more,study}.js` — оверрайд **только представления** (переназначают `App.screens`, сбрасывают `App.sheets`/`App.overlays`, переопределяют часть actions). `app/index.html` **рукописный, не генерируется** (§2.2): `injectAppShell` path-skips `app/` через SKIP_DIRS, но `inject-auth` врезает auth-блок (body.app) — после правок нужен `node scripts/inject-auth.js`. Desktop-бандл прелоадится в `<head>` (rel=preload, gated на HSK_DESKTOP), чтобы грузиться параллельно.

**Хранилище/синк.** Канонические ключи `hsk4_*`/`hsk4-*` (общие со старыми страницами на устройстве — namespace унифицирован, прежний `hsk4m-*` убран); `migrateLegacy` один раз сворачивает legacy `hsk4_result_*`/`hsk4_progress_*` (скан 0..60, маркер `hsk4-app-migrated`). Кросс-девайс синк — `app/sync.js` union-merge'ит blob прогресса в `profiles.progress` (§4.11, §11), gated на auth+session, non-blocking.

**Экзамен-плеер.** Тот же формат HSK 4, но **интерактивный с автопроверкой**. Ключевое отличие: секция 书写 (письмо) — **self-check** (показ эталонных ответов), НЕ авто-оценивается как multiple-choice; band /300 проецируется из Listening+Reading (порог 180), кольцо результата показывает band/300. Аудио-клип «плюс два прослушивания» списывается на **старте** (не на конце), чтобы уход с вопроса не сбрасывал лимит.

**Day-0 персонализация.** Клиент читает `profiles.onboarding` (ответы воронки) → приветствие по имени, предвыбор уровня цели (не переспрашивает), фокус Day-0 на слабой секции (`HSKAuth.getOnboarding`, more.js hookupAuth).

**Устойчивость.** Двухфазная загрузка (дашборд/экзамены/словарь рисуются на ядровых `index`/`vocabulary`/`app-data`; Characters/Study догружаются фазой 2 со спиннером); экран «ошибка + Try again» при сбое загрузки ядрового каталога; глобальный error-boundary (`window.error`/`unhandledrejection` → Метрика) + boot-fallback в `app/index.html`; статичный глиф-fallback при недоступности CDN HanziWriter.

## 6. Маркетинговый лендинг (/)

Рукописный файл index.html (1 410 строк) с **dual-markup**: блоки `.lp-desktop` и `.lp-mobile` в одном файле, переключаемые единственным `@media (max-width:760px)`; оба используют общий landing.js через одни data-хуки; мобильные id с префиксом `m-`. `body.lp` — inject-auth и injectAppShell страницу пропускают; лендинг публичный.

Секции (desktop): sticky-nav (лого 汉-tile, якоря, «Log in» → /login/, CTA «Start →» → /quiz/); hero с parallax-иероглифами, клеймом «HSK 5+ 通过 PASSED» и H1 «Reach the level your university asks for — on your first try»; 2 реальных скана сертификатов HSK 5 (PII отредактирована; PNG ~1.1 МБ, помечены кандидатами на WebP); count-up статистика (12 400+ студентов, 38 000+ секций, 4.8★ — литералы в HTML); marquee 7 реальных логотипов вузов (Tsinghua, Peking, Fudan, Jiao Tong, Zhejiang, Wuhan, Tongji); «How it works» ×3; интерактивный выбор уровня HSK 1–6 (полный курс — бейдж только у HSK 4); 6 табов платформы с мокапами в браузер-фрейме; сравнение «HSK Prep vs private tutor» (цен подписки на лендинге нет — цены живут только в пейволле воронки); 6 отзывов «4.8 · 1,200+ verified reviews»; тёмная секция Guarantee «Pass, or your money back» + retake fee; FAQ ×5 (аккордеон, по умолчанию все закрыты, открыт максимум один); футер (секция UGC-креаторов и юридические ссылки закомментированы). Mobile: те же данные, swipe-карусели (scroll-snap), sticky-CTA снизу после scrollY > 560.

Интерактивность landing.js: делегированный capture-обработчик клика по любому `a[href^="/quiz"]` шлёт цель `landing_cta` (best-effort; надёжная точка входа — ob_start уже на /quiz/); level/tab-пикеры, FAQ, count-up по IntersectionObserver, scroll-reveal, parallax; всё уважает prefers-reduced-motion. CTA в воронку — 8 штук (4+4).

landing-auth.js — session-aware CTA: **никогда не редиректит** (комментарий фиксирует: авто-форвард создал бы петлю / → /exams/ → /quiz/?sub=required); при активной сессии переписывает CTA на «My workspace»/«Go to workspace» с href=/exams/, восстанавливая исходную разметку при выходе. При `?code=` в URL (возврат Google OAuth на корень) страница прячется классом `hsk-oauth-pending`, пока auth.js не обменяет код.

Служебное: 404.html — публичная noindex-страница с 6 «спасательными» карточками; api/leads.js — мёртвый стаб лид-формы (единственный потребитель закомментирован в /exams/); google-verification файл; CNAME.

## 7. Онбординг-воронка /quiz/

Единственная полностью генерируемая «приложенческая» страница: buildQuizFunnel() встраивает в quiz/index.html конфиг `window.OB_CONFIG` из data/onboarding.json (с эскейпом против выхода из `<script>`), рантайм — onboarding.js (1 449 строк, vanilla IIFE). Страница `body.lp ob`, `noindex,follow`, не входит в sitemap; auth-скрипты прописаны в шаблоне вручную.

### 7.1 Карта экранов

26 экранов s0–s25; FLOW-массив содержит 24 (s23 чекаут и s24 exit-intent — модальные оверлеи). 9 анкетных экранов входят в прогресс-счётчик «n of 9». Одиночный выбор автокоммитится через 170 мс; multi-select s8 требует ≥1 выбора.

| Экран | Назначение |
|---|---|
| s0 welcome | «Pass HSK on your first try», CTA «Start free assessment»; цель ob_start |
| s1 | соцдоказательство (2 отзыва) |
| s2–s3 | цель сдачи (5 опций) и целевой уровень HSK 3–6 (4 — recommended) → {target_level} |
| s4 | авторитет: стандарт HSK 3.0, реальные билеты H41220/H41221 |
| s5–s6 | первый ли HSK + подбадривание |
| s7 | слабая секция listening/reading/writing → {weak_section} |
| s8 | multi-select 8 «болей» |
| s9 | срок экзамена (4 диапазона) |
| s10 | «Why HSK Prep works» (80% first-try pass rate) |
| s11–s12 | время в день (15/30/60/120 мин) + главный страх |
| s13 | **диагностика**: 5 реальных вопросов (резолвятся на билде: test-01 №11 listening с аудио и №46 reading, квиз паттерна jinguan-danshi, квиз пары cai-jiu, слово id 1756 с 3 дистракторами); резюм с первого неотвеченного. Аудио listening-вопроса — с media.mandarinzone.com: **pre-payment шаг конверсионного пути зависит от внешнего медиахоста** |
| s14 | «Analyzing…» — спиннер с 3 шагами, автопереход ~2.3 с, back заблокирован |
| s15 | mirror-сводка: Goal / You now {diagnostic_result} / Weak spot / Time per day |
| s16 | имя (опционально, Skip; PII-маскировка Метрики) |
| s17 | **email-гейт** (жёсткий, без Skip); цель ob_email_view |
| s18–s19 | growth-кривая от {diagnostic_result} к {target_level} + таймлайн Day 1 → Week 8 |
| s20 | value stack («100 full HSK mock exams», план, словарь) + Pass guarantee |
| s21 | колесо скидки: 6 сегментов 10–50%, выигрыш **всегда 50** |
| s22 | **пейволл**: 3 тарифа, циклический таймер 10:00, чипы персонализации, пример score report с пометкой «Example», «857 learners started this week», «One-time payment. No auto-renewal»; цель paywall_view |
| s23 | модал чекаута: тариф, «Total due today», селект страны (значение никуда не отправляется), дисклеймер; закрытие → s24 |
| s24 | exit-intent «−50% Special offer» (фактически те же цены) → снова s23 |
| s25 | success: «You're in!», CTA «Start studying» → **/app/** (handoffUrl, §5.1); до подтверждения entitlement CTA disabled «Setting up your access…» |

Диагностический результат: levelScale [2.3, 2.9, 3.2, 3.4, 3.7, 4.1] по числу правильных (0–5), Math.round → 0 верных = «HSK 2», 1–3 = «HSK 3», 4–5 = «HSK 4» — «You now» никогда не выше HSK 4, чтобы кривая роста показывала разрыв до цели.

### 7.2 Состояние и гейты порядка

State в localStorage `hsk_onboarding_v1` `{idx, answers}`. Порядок enforced: onboarding → auth (s17) → paywall (s22) → app. `gateIdx()` на восстановленном idx: откат на первый незаполненный анкетный экран (GATE_ANSWERS для 9 экранов; s13 требует полный diag), откат на s17 при отсутствии stored-session-токена; асинхронная перепроверка getUser() ловит мёртвый токен. navLock 350 мс — защита от даблкликов по CTA. `?reset=1` — сброс state/complete/subscription (ключи hsk_pay_pending и hsk_checkout_started не трогаются). Завершённая воронка (`hsk_onboarding_complete='1'` + наличие stored-токена сессии; живость токена проверит уже гард на /app/) — once-only redirect на **/app/** (handoffUrl).

### 7.3 URL-протокол

- `?signin=1` — легаси-вход от старого гарда (сейчас гард шлёт на /login/?next=): цель signin_required; на s17 (или первый незаполненный экран) пользователя приводит уже кламп gateIdx;
- `?sub=required` — от auth-guard при аккаунте без подписки: однократная перепроверка сервера; активна → цель sub_required{restored} + возврат в **/app/** (handoffUrl); достоверно нет → локальные completion-флаги стираются, ответы регидрируются из profiles.onboarding (для нового устройства), воронка переоткрывается на s22 (цель sub_required{reopened}); ошибка чтения → пейволл, но флаги сохраняются (сетевой сбой ≠ отсутствие подписки);
- `?pay=success` / `?pay=cancel` — возврат с эквайринга (§9.4);
- `?oauth_error=1` — назначение из auth.js при провале OAuth-обмена; параметр никем не читается.

### 7.4 Email-гейт s17

Фаза email: валидация regex, «Show my plan» → `signInWithEmailOtp(email, {next:'/quiz/'})` — **создаёт аккаунт самим фактом ввода email** (shouldCreateUser по умолчанию true); альтернатива «Continue with Google» (prompt: select_account). Фаза кода: инпут maxlength 8 / one-time-code, «Verify & show my plan» → verifyOtp type 'email' с фолбэком 'signup'; Resend с клиентским кулдауном 4 с; «← Use a different email». После верификации — upsert профиля + syncToProfile (ответы воронки → profiles.onboarding). Возврат из OAuth на s17 с уже активным sub — self-heal: redirect в /exams/. Поля имени и email маскированы от Вебвизора (ym-disable-keys ym-hide-content).

### 7.5 Персонализация

Динамические токены: `{target_level}`, `{diagnostic_result}`, `{weak_section}`, `{daily_time}` подставляются в копирайт s15/s18/s22/s25; `{price}`/`{interval}` — только в disclosure чекаута s23. Объявленные в коде `{plan}`, `{discount}` (константа '50%') и `{name}` в копирайте экранов не используются (мёртвые записи DYN); «50%» на s21/s22 — литералы конфига. Отдельный канал — статические плейсхолдеры `OB_CONFIG.placeholders`: learner_count '1000', pass_rate '80%', n '857' (цифры соцдоказательств централизованы в одном JSON-ключе), при этом `authority_logos` пуст (блок логотипов s4 не рендерится), `starter_kit` — незаполненный плейсхолдер, а ключ trustBadges поддержан кодом, но в данных отсутствует.

### 7.6 Механики дефицита

Зафиксированное в коде поведение: колесо s21 всегда останавливается на сегменте 50% (`wheel.win: 50`); зачёркнутые base-цены — ровно 2× фактических; записанный A.discount на сумму не влияет; таймер пейволла 600 с по истечении молча сбрасывается на 10:00 и идёт по кругу (помечено в коде «intentional loop»); exit-intent повторяет тот же оффер. Валидация этих решений — §16.А.

## 8. Аутентификация и авторизация

### 8.1 Модель

Полностью клиентская, Supabase (PKCE, persistSession, detectSessionInUrl:false). Глобал `window.HSKAuth` (auth.js, 543 строки) + гейт auth-guard.js + маршрутизатор route-decision.js (чистая функция, покрыта 8 тестами node --test) + страница /login/ + приёмник /auth/callback.html.

Методы входа: **email OTP** (основной; письмо содержит и код, и magic-link), **Google OAuth** (PKCE; redirectTo всегда /auth/callback.html?next=; подстраховка finishOAuthFromUrl обменивает ?code= на любой странице), **пароль** (скрытый путь на /login/ для тестовых аккаунтов с недоставляемыми email). `signUp` (классическая регистрация) существует в API, но не имеет call sites.

Два потребителя OTP с разной политикой: воронка создаёт аккаунт (createUser не передан), /login/ — только существующие (`createUser:false`; «нет аккаунта» распознаётся regex-ом по ответу `user not found|signups? not allowed|otp_disabled|user_not_found` — работает при **выключенной** enumeration protection в Supabase, это требование конфигурации).

### 8.2 auth-guard: гейт платформенных страниц

Подключён в 598 страниц; пропускает 404 и /auth*; no-op без конфига. Класс `body.app` при этом есть только у 157 из них: 441 детальная страница иероглифов несёт гейт при body без .app (см. §16.Б.12). Анти-flash: класс `hsk-auth-pending` на `<html>` прячет контент до решения; вуаль не ставится вовсе, если синхронно найден userId + свежий позитивный кэш подписки. Решение:

1. нет сессии → `/login/?next=<path+search>`;
2. сессия + валидный кэш `hsk_sub_cache` (sessionStorage, TTL 15 мин, только позитивные записи) → показать;
3. иначе `getSubscriptionStatus` (таймаут 8 с): ошибка чтения → **fail-open** (показать: сбой сети не должен выкидывать платящего); подписка активна (`status==='active'` и expires_at в будущем) → кэш + показать; достоверно нет → `/quiz/?sub=required` **не снимая вуали**.

### 8.3 Маршрутизация после входа

`decideRoute({sub, next})`: none → /quiz/?sub=required; active|error → safeNext(next) (fail-open). `safeNext`/`safeNextPath` подставляют дефолт `/app/` и нейтрализуют open-redirect (не-/, //, \, отсутствие next → **/app/**; с 2026-07 — не /exams/). `routeAfterAuth(next)`: failsafe-таймер 8 с, прогрев hsk_sub_cache при активной подписке (целевая страница открывается без вуали). Callback: обмен голого code (не URL — иначе flow_state_not_found), upsert профиля, routeAfterAuth; ошибка → карточка «Sign-in failed» → /login/.

### 8.4 /login/ — вход для существующих аккаунтов

noindex, robots Disallow. Состояния: Checking session (при живой сессии форма не показывается — сразу routeAfterAuth) → Email («Welcome back», «Send login code», Google, «New here? Take the free assessment →» → /quiz/, неброская ссылка «Log in with password») → Code (verify, Resend с кулдауном 4 с и блокировкой во время верификации, «← Use a different email») → при неизвестном email «No account found» с CTA в воронку → Password-экран («Wrong email or password.»). Без конфига — «Local preview → Enter» в /app/. Целей Метрики /login/ не шлёт (кроме центральной цели auth из auth.js).

Ограничение архитектуры (важно для ТЗ): гейт — **клиентский JavaScript поверх статических файлов**. Файлы контента физически доступны прямым запросом; гейт защищает UX-поверхность, а не сами данные; /data/*.json публичны. Раньше те же страницы попадали ещё и в sitemap; после O5 (решение владельца «no freemium») sitemap объявляет только лендинг, но страницы остаются индексируемыми — модель «SEO-индексация платного контента → воронка» сохраняется. Sitemap-часть открытого вопроса §16.Б закрыта (prune-only), гейт/контент не менялись.

### 8.5 Профиль

`upsertProfile` после каждого успешного входа (id, email, name из user_metadata, country); `updateProfile` — whitelist name/country/onboarding (канал воронки). Виджет профиля — §5. Sign out — очистка кэшей + редирект на /.

## 9. Платежи и entitlement

### 9.1 Сквозной путь денег

```
s22 пейволл → s23 чекаут → [2 pre-check'а дублей] → redirect pay.studybox.kz/checkout
   ?product=hsk&plan=<id>&uid=<supabase uid>&email=<email>
   &return=https://www.hskprep.cc/quiz/?pay=success&cancel=.../quiz/?pay=cancel
→ StudyBox шлёт HMAC-вебхук → edge-функция grant-entitlement
→ строка в леджер payments → apply_hsk_entitlement() пересчитывает profiles.subscription
→ пользователь возвращается на /quiz/?pay=success → s25 + поллинг → /exams/
```

Сумма в URL не передаётся — её определяет StudyBox по plan; email пользователя уходит в query-string (§16.Г). Обязательства внешней стороны зафиксированы контрактной спецификацией docs/studybox-payment-integration.md: StudyBox не пишет в БД HSK и не получает service-role key; браузерный redirect — «UX only», entitlement даёт исключительно верифицированный server-to-server вызов.

### 9.2 Pre-check двойной оплаты (клиент)

Перед редиректом: (1) свежий (TTL 30 мин) флаг `hsk_pay_pending` — оплата уже заявлена, вебхук мог не долететь → второй чардж не стартует, цель checkout_duplicate_prevented{pay_pending}, переход на s25 с поллингом; (2) `getSubscriptionStatus` — уже активна → checkout_duplicate_prevented{active}, фиксация флагов, s25 без оплаты. Умершая сессия → возврат на s17 (чекаут не привязать к аккаунту). Закрытый пользователем модал отменяет все терминальные действия асинхронной цепочки («закрытый чекаут никогда не редиректит за спиной»). Цель begin_checkout — только когда cross-domain-редирект неминуем.

### 9.3 Вебхук grant-entitlement (server)

Деплой `--no-verify-jwt` (несёт только HMAC). Контракт: POST `{uid, plan, order_id, currency:"KZT", paid_at, ts, receipt?}` + `X-HSK-Signature` = HMAC-SHA256 сырых байт тела секретом `HSK_GRANT_HMAC_SECRET`; сравнение constant-time. Отказы: 401 плохая подпись; 400 — битый JSON, неизвестный plan, не-KZT, `ts` вне окна ±300 с, отсутствие обязательных полей (намеренно 400, а не 5xx — чтобы эквайринг не ретраил шторм). PLAN_MAP (1mo→7990/1, 3mo→13990/3, 12mo→19990/12) обязан совпадать с onboarding.json. Леджер-строка пишется идемпотентно по PK order_id (конкурентный дубль 23505 толерируется); **entitlement пере-применяется на каждый вызов, включая реплей** — повторный POST лечит прошлый сбой гранта (runbook потерянного вебхука). Ошибка RPC → всё равно 200 `{entitlement:false}` (алерт + повторный прогон).

### 9.4 Возврат пользователя и поллинг

`?pay=success`: ставится pay_pending, s25 показывается оптимистично с disabled CTA, `pollSubscription` — до 6 чтений с паузами 1 с; проверяется именно `subActive()` (не голый status — старая протухшая строка не должна удовлетворить поллинг при повторной покупке). Подтверждено → фиксация entitlement (LS_DONE='1', hsk_subscription, прогрев hsk_sub_cache; в success-пути это пара warmSubCache+finishSuccess, в остальных путях — recordEntitlement с теми же эффектами) + цель purchase{plan, order_price, currency, order_id}. Таймаут (~6 с) → CTA разблокируется («never trap the user»), но LS_DONE **не** ставится — реконсиляция при следующем визите. Self-heal: у залогиненного на /quiz/ без параметров однократно перечитывается entitlement — активен → редирект в /exams/ (заплативший не смотрит на пейволл вечно). `?pay=cancel`: чистка pay_pending, цель payment_cancelled, возврат на s22 + автопоказ exit-intent.

### 9.5 Леджер и fold-политика (server)

Таблица `payments`: order_id PK, user_id (on delete set null — леджер переживает удаление пользователя), plan, amount, currency, status ('paid' default | 'refunded' — право даёт только 'paid'), months, receipt, paid_at, raw jsonb, review_status/review_note. **RLS включён с нулём политик** — леджер невидим любому клиенту, пишут только две edge-функции под service-role.

`apply_hsk_entitlement(uid)` — единственный писатель `profiles.subscription`: под row-lock FOR UPDATE фолдит все paid-платежи по (paid_at, order_id) — каждый заказ продлевает покрытие от max(предыдущий expiry, свой paid_at) на календарные месяцы (клэмп конца месяца Postgres). Заказ, оплаченный поверх идущего покрытия, флажится `review_status='double_charge'` (вердикт оператора не перетирается) — очередь на проактивный рефанд; **деньги не теряются — сроки стэкуются**. 0 оплаченных заказов → subscription = null (полный отзыв). Канонический jsonb: `{status:'active', plan, price, currency:'KZT', interval, provider:'studybox', order_id, paid_at, expires_at}` (ISO-даты в JS-формате).

Защита от self-grant: триггер `profiles_guard_subscription` — писать subscription может только service_role или функция с транзакционным флагом `hsk.entitlement_writer='1'`; клиентские INSERT/UPDATE с subscription → exception; прямые UPDATE из SQL-редактора тоже блокируются (subscription не должен дрейфовать от леджера). Refund-runbook: рефанд на эквайринге → status='refunded' → пересчёт → покрытие сжимается/обнуляется.

### 9.6 Симуляция для превью

Без сконфигурированного Supabase **или** без pay.checkoutUrl чекаут заменяется симуляцией: через 1.2 с пишется локальная «подписка» provider:'simulated' (expires = месяцы×30 дней) и воронка завершается. Сервер такую подписку не признает — при сконфигурированном Supabase, но потерянном checkoutUrl это ловушка деградации (§16.Г).

### 9.7 Матрица edge-cases

| Сценарий | Поведение |
|---|---|
| двойной клик Pay / повторный чекаут в 30-мин окне | блок по pay_pending → s25 + ре-поллинг |
| entitlement активен на момент Pay | чекаут не стартует, s25 |
| второй реальный чардж прошёл | сроки стэкуются + double_charge в ревью-очередь |
| реплей/ретрай вебхука | идемпотентность order_id; entitlement пере-применяется |
| вебхуки не по порядку | fold сортирует по paid_at — результат сходится |
| отмена оплаты | s22 + exit-intent, pay_pending снят |
| сессия умерла при Pay | возврат на s17, редиректа нет |
| вебхук опоздал > ~6 с | CTA разблокирована, LS_DONE нет; self-heal позже |
| модал закрыт во время async | live()-проверка отменяет редирект |
| клиент пишет subscription сам | exception триггера |

## 10. Админ-панель и comp-аккаунты

### 10.1 Edge-функция admin-provision

Выдача бесплатного доступа авторам/тестировщикам. Деплой `verify_jwt=false`; гейт — заголовок `x-hsk-admin-secret` против env `HSK_ADMIN_SECRET` (constant-time, значение не логируется; 401 unauthorized); CORS-allowlist четырёх origin как defense-in-depth. Действия (`body.action`):

- **create**: email (обязателен), name, plan (default 12mo), months-override (положительное число, серверного верхнего капа нет), with_password (строго === true; по умолчанию passwordless — вход по OTP/Google), reset_password. Пользователь ищется постраничным перебором listUsers (потолок 25×200=5000), при отсутствии создаётся с `email_confirm:true`; пароль (формат `Kf7q-Rp2m-Xt9d-Vb4h`, без неоднозначных символов) минтится только для тестовых аккаунтов. Комп оформляется **строкой леджера**, не ручной записью подписки: `order_id='comp-<uuid>'`, amount=0, status='paid', raw={comp:true,...} → пересчёт apply_hsk_entitlement. Анти-даблкомп: при живой (paid) последней comp-строке новая не вставляется (`already_comped:true`).
- **list**: все comp-строки + join профилей, дедуп до одной на пользователя; статус подписки из jsonb.
- **revoke**: все paid comp-строки uid → refunded → пересчёт; реальные оплаты пользователя сохраняют покрытие.

### 10.2 Панель /admin/

Одностраничная, на русском, noindex + robots Disallow. Гейт — ввод секрета (хранится в sessionStorage `hsk_admin_secret`, валидируется пробным list; 401 стирает ключ). Форма: email, имя, тип аккаунта («Автор — passwordless» default / «Тестовый — по паролю»), срок 12/3/1 мес или «Другой срок…» (числовое поле, custom отправляется как plan '12mo' + months-override). Результат: креды + «Готовое сообщение» для отправки автору (два шаблона: тестовому — пароль + «Log in with password»; автору — «введи email на /login/ — придёт код, или Continue with Google»). Таблица созданных аккаунтов с бейджем подписки и кнопкой «Отозвать» (confirm). Вопреки комментарию в head «No third-party scripts on this page by design», на странице стоит Яндекс Метрика с вебвизором (§16.Г).

## 11. Backend: схема Supabase

`supabase/schema.sql` (идемпотентен, запускается в SQL Editor):

- **profiles**: id uuid PK = auth.users(id) on delete cascade, email, name, country, created_at/updated_at, `onboarding jsonb` (пишет клиент), `subscription jsonb` (пишет только сервер), **`progress jsonb`** (пишет клиент — сводный blob прогресса `/app/` для кросс-девайс синка, §4.11; добавлен миграцией add_profiles_progress, применённой на прод-БД). RLS: три политики «только своя строка» (select/insert/update по auth.uid()=id), delete-политики нет.
- **Триггер handle_new_user** (after insert on auth.users, security definer): создаёт профиль из raw_user_meta_data (name|full_name, country); on conflict обновляет только email/updated_at — не затирает name/onboarding/subscription. Смена email существующего auth-пользователя профиль не обновляет (триггер только на insert; комментарий в схеме обещает больше — §16.Г).
- **payments** — §9.5. Индекс (user_id, paid_at).
- **Функции**: hsk_iso() (JS-формат ISO), apply_hsk_entitlement() (execute только service_role; владелец может вызывать из SQL-редактора для раннбуков), guard_subscription_write().

Операционные документы: supabase/PAYMENTS_SETUP.md — полный runbook (настройка, контракт вебхука, тарифы, политика двойных списаний, refund- и lost-webhook-раннбуки, launch-чеклист); docs/studybox-payment-integration.md — контракт для внешней команды StudyBox (§2.5, §9.1); scripts/configure-supabase-auth-urls.sh — настройка Site URL и redirect-allowlist через Management API.

## 12. Аналитика (Яндекс Метрика)

Счётчик **110455584**; сниппет инжектится на все страницы (кроме ds-bundle) c clickmap, trackLinks, accurateTrackBounce, **webvisor:true**, ecommerce:'dataLayer' (dataLayer.push нигде не вызывается — e-commerce-канал фактически не используется, выручка идёт параметром цели). Глобальный хелпер `window.ymGoal(name, params)`.

Реестр целей:

| Цель | Параметры | Триггер |
|---|---|---|
| landing_cta | — | клик по любому a[href^="/quiz"] на лендинге |
| ob_start | — | рендер s0 (once per pageload) |
| ob_email_view | — | рендер s17 |
| auth | via: onboarding\|login\|callback\|app\|unknown | SIGNED_IN, только при маркере hsk_auth_pending свежее 10 мин (ставят signIn/signInWithGoogle/verifyEmailOtp; вход по magic-link из письма маркер не ставит и цель не фиксирует) |
| paywall_view | — | рендер s22 |
| begin_checkout | plan, order_price, currency | перед реальным редиректом на эквайринг |
| purchase | plan, order_price, currency, order_id | только после серверно подтверждённого entitlement |
| payment_cancelled | — | возврат ?pay=cancel |
| checkout_duplicate_prevented | plan, reason: pay_pending\|active | pre-check'и дублей |
| signin_required | — | вход в /quiz/ с легаси ?signin=1 |
| sub_required | outcome: reopened (+at: auth\|paywall) \| restored | обработка ?sub=required |
| app_enter | — | в коде отсутствует — URL-visit-цель «path contains /exams/», настроенная в интерфейсе Метрики |

Обёртка obTrack перекладывает value → `order_price` (зарезервированный параметр дохода Метрики). В интерфейсе счётчика оформлены целями 7 JS-событий воронки (landing_cta → purchase) + URL-цель app_enter («path contains /exams/»); остальные reachGoal-вызовы (payment_cancelled, checkout_duplicate_prevented, signin_required, sub_required) шлются кодом, но целями в UI не оформлены. PII: классы `ym-disable-keys ym-hide-content` стоят только на полях имени и email воронки; поля email и кода на /login/ не маскированы при включённом вебвизоре (поле пароля — input type=password, его содержимое вебвизор не пишет по умолчанию); Метрика стоит и на /admin/ (§16.Г). Ядро продукта (плеер экзаменов, тренажёры) продуктовых событий не шлёт.

## 13. SEO

### 13.1 Канонический хост и sitemap

Канонический домен `https://www.hskprep.cc` (с www) — захардкожен литералом ~47 раз в build.js + CNAME, robots.txt, config/auth.example.js. sitemap.xml (после **O5**, коммит ba016368): **1 URL** — только публичный лендинг `/` (priority 1.0, changefreq monthly, lastmod = дата сборки). Решение владельца «no freemium»: все ~597 гейтированных `body.app` URL (хабы, /test/NN/, иероглифы, grammar-паттерны, темы, категории и т.д.) убраны из sitemap, чтобы не рекламировать soft-404-контент за пейволлом; сами страницы остаются генерируемыми, индексируемыми (robots Allow, без noindex) и кросс-линкованными — sitemap их просто больше не объявляет. Прежняя ступенчатая раскладка приоритетов (массивы existingPages/testPages/…) из buildSitemap удалена. /quiz/, /login/, /admin/, /auth/ и раньше отсутствовали (noindex/Disallow).

### 13.2 Зафиксированное несоответствие: старый домен

46 закоммиченных рукописных страниц (хабы exams/vocabulary/topics/sentences/traps/words/grammar/writing, 11 grammar-тем, guide, весь strategies и compare, 9 custom-страниц words, writing/paragraph и sentence-order, grammar/patterns/buguan-dou) несут canonical/og:url/JSON-LD-url на **старый домен hsk4.mandarinzone.com**, тогда как сами страницы физически на www.hskprep.cc (этих URL после O5 уже нет в sitemap, но они остаются индексируемыми) — build.js их `<head>` не переписывает. Требуется точечная правка (§16.Б).

### 13.3 Структурированные данные

JSON-LD по типам: Quiz с hasPart×3 и isAccessibleForFree:true (/test/NN/), Article+FAQPage (topics, words, grammar-patterns), CollectionPage (хабы characters, grammar/patterns и compare), LearningResource(+FAQPage у топ-30) (иероглифы), Article (sentences). Главный хаб /exams/ несёт три рукописных блока: WebApplication («Free online HSK 4 practice tests…»), LearningResource («14 free HSK 4 mock exams…») и FAQPage — ещё два машиночитаемых «free»-клейма на гейтированной странице. BreadcrumbList есть на 16 страницах: рукописные strategies (хаб+9) и подстраницы compare (3), хабы sentences и traps, grammar/measure-words. Всего schema.org несут 585 из ~597 гейтированных страниц (без разметки: /, /practice/, /train/, /writing/complete-sentence/, 7 категорий traps, 2 транскрипта). Разметка живёт на самих страницах и не завязана на sitemap — после O5 в sitemap только лендинг, а страницы со schema.org остаются на месте. hreflang отсутствует во всём репозитории; языковая принадлежность — og:locale + inLanguage ["en","zh-CN"].

### 13.4 robots.txt

Disallow /data/, /admin/, /login/ для всех; SemrushBot/AhrefsBot/MJ12bot запрещены полностью; GPTBot/ClaudeBot/Google-Extended — Allow (комментарий обещает «slow crawl down», директив нет); Sitemap-ссылка.

### 13.5 Пересечение SEO и гейтинга

Гейтируемая поверхность — auth-guard на ~598 `body.app` страницах (из них 585 со schema.org); гейт клиентский. **После O5** sitemap эти страницы больше НЕ рекламирует (в нём только лендинг), поэтому submitted-sitemap soft-404 в Search Console устранён; но страницы остаются индексируемыми и кросс-линкованными, так что Google может дойти до них по внутренним ссылкам (принятый non-goal). Пользователь из выдачи по-прежнему попадает в редирект на /login/ → воронку. Наиболее острая версия конфликта — «Free»-копирайт и isAccessibleForFree:true / «Free online practice tests» в structured data на закрытых страницах (§16.А/Б) — сохраняется (structured data не менялась).

## 14. Операционные процессы

- **Изменение контента**: правка data/*.json → `node build.js` → `node scripts/inject-auth.js` (при новых app-страницах) → коммит сгенерированного (~600 файлов) → push (авто-деплой). Данные и производные счётчики подхватываются автоматически; захардкоженные литералы из §2.3 — нет.
- **Добавление экзамена**: файл test-NN.json + запись в index.json; TEST_COUNT/TOTAL_QUESTIONS, страницы, syncCounts — автоматически (в sitemap тестовые страницы после O5 не попадают — там только лендинг). Если бумага официальная (official:true или listening_audio) — автоматически пополняются письменные дриллы и транскрипты.
- **Классификация тем**: scripts/classify_topics.py пишет topics.json, но текущий файл правился руками — процесс требует решения (§16.В).
- **Выдача comp-доступа**: /admin/ → create → отправка «готового сообщения» автору; отзыв — revoke.
- **Рефанды/двойные списания**: очередь review_status='double_charge' в payments; runbook в PAYMENTS_SETUP.md.
- **Тесты**: 13 файлов node-тестов scripts/*.test.js (103 кейса, запуск `node --test scripts/*.test.js` или пофайлово `node scripts/<x>.test.js`): route-decision (8, маршрутизация/open-redirect), access-decision (11, fail-closed логика гейта доступа), access-authjs (26, auth.js checkAccess + durable grace-marker + uid-scoped isPayPending/isPayReported/armPayPending + checkout-start маркер + разделение доступ-грейса и подавления списания [O3, P2/G4, C1/I1]), auth-guard (2, fail-closed при отсутствии access-decision.js [L3]), sync-merge (8, union/LWW-мёрж прогресса), skills-selfcheck (8, Writing = self-check в skill-плитках), band-score (7, регресс bandScore/estScore /300 [M4]), grade-sections (3, общий App.exam.gradeSections + паритет с bandScore [M5]), exam-audio (8, наследование клипа второй репликой listening-пары + writing self-check normalizeQ [M6]), exam-resume (3, клэмп резюме по полной бумаге [L1]), data-phase2 (5, независимые чейны Characters/Study [L2]), plan-charge (6, защита от двойного списания в in-app Extend access [P6]), writing-models (8, классификатор сборки предложений в 书写 на реальных data/test-*.json [P7]); и 2 Deno-теста edge-функций (`deno test supabase/functions/*/lib.test.ts`): check-access/lib.test.ts (7, computeActive + corsHeaders) и grant-entitlement/lib.test.ts (5 Deno-тестов платёжной криптографии и валидации: verify/reject HMAC, derivePlan, timingSafeEqual, freshTs с окном ±300 с и clock skew); математика apply_hsk_entitlement (включая клэмп конца месяца) верифицирована rollback-обёрнутым SQL-батчем на живом проекте (PAYMENTS_SETUP.md:88-90). Паттерн index.ts/lib.ts в edge-функциях — вынос чистых функций ради тестируемости.
- **Файлы-сироты**: scripts/all_words.txt (981-строчный pipe-словарь, вероятный исходник vocabulary.json) и data/official-characters.json не читаются никаким кодом (§16.В).

## 15. Сводный реестр ключей хранилищ

| Ключ | Хранилище | TTL/семантика |
|---|---|---|
| hsk4_theme | localStorage | тема; сохранённое значение сильнее системной |
| hsk4_progress_{i}, hsk4_result_{i} | localStorage | плеер экзаменов |
| hsk4-vocab-mastered, hsk4_kt_words, hsk4-guide-path | localStorage | прогресс словаря/письма/гайда |
| hsk_onboarding_v1 | localStorage | state воронки {idx, answers} |
| hsk_onboarding_complete | localStorage | '1' при подтверждённом entitlement (или в симуляции превью без Supabase) |
| hsk_subscription | localStorage | локальная копия подписки |
| hsk_pay_pending | localStorage | `{uid, ts, src}` окна оплаты, TTL 30 мин; src='return' (возврат воронки) или 'start' (уход на эквайер из /app/). Читают ДВА места через единый парсер HSKAuth.readPayPending: доступ-грейс isPayPending(uid) требует совпадения uid, подавление повторного списания payPendingFresh() смотрит только ts |
| hsk_checkout_started | localStorage | `{uid, ts}` — доказательство реально начатого чекаута, TTL 30 мин; взводится перед редиректом на эквайер, потребляется (удаляется) на возврате обеими ногами через HSKAuth.returnGraceUid() — без него ?pay=success не выдаёт грейс |
| hsk_auth_pending | localStorage | маркер «вход инициирован», окно 10 мин (цель auth) |
| *-auth-token | localStorage | сессия supabase-js |
| hsk_sub_cache | sessionStorage | позитивный кэш подписки, TTL 15 мин |
| hsk_profile_cache | sessionStorage | кэш профиля, TTL 24 ч |
| hsk_auth_next | sessionStorage | next через OAuth-раунд-трип, одноразовый |
| hsk_admin_secret | sessionStorage | секрет админ-панели (per-tab) |

---

## 16. Вопросы к владельцу продукта

Всё ниже — места, где код (и закоммиченная intent-документация, §2.5) фиксирует поведение, но оставляет открытым решение. Там, где blueprint/спеки уже отвечают «это задумано», вопрос переформулирован в валидацию решения, а не в выяснение. Сгруппировано по темам; в скобках — привязка к коду.

### А. Маркетинговые клеймы и юридика

1. **«100 mock exams» в воронке.** mocksDisplay=100 подставляет в s20/s10 «100 full HSK mock exams» при реальных 14; syncCounts намеренно пропускает /quiz/ (data/onboarding.json:8, build.js:1550). Подтвердить осознанность разрыва — особенно рядом с money-back guarantee на том же экране.
2. **Механики дефицита.** Колесо всегда выигрывает 50%, base-цены = ровно 2× фактических, таймер 10:00 зациклен, exit-intent не даёт новой цены (onboarding.js:877, 990). Blueprint (docs/hskprep_onboarding_blueprint.md:30-31, 237, 241) фиксирует всё это как **задуманный дизайн** («результат всегда 50%», «просто рефрешится, реального снятия скидки нет», «скидка уже зашита в цены — на checkout повторно не применять») — так что вопрос не «что это», а: проходила ли механика юридическую оценку («фиктивная скидка»/вечная срочность) для рынка Казахстана, и планируется ли когда-нибудь реальная переменная скидка?
3. **Юридические страницы.** Чекаут ссылается текстом на Terms/Privacy/Refund Policy, лендинг — на «guarantee terms page»; ни одной из страниц не существует, ссылки закомментированы (index.html:701, 787-789; data/onboarding.json:272). Канонический текст условий гарантии уже написан в blueprint (docs/hskprep_onboarding_blueprint.md:212-213: ≥90% плана, официальный HSK в 60 дней, score report, возврат = цена подписки). Когда публикуем страницы и покрывают ли они Terms/Privacy/Refunds целиком?
4. **Две версии гарантии.** Лендинг обещает money-back **и оплату пересдачи** (index.html:697), воронка — только возврат при ≥90% плана + сдача в 60 дней. Какая формулировка каноническая?
5. **«Free» на платном продукте.** «14 Free Mock Exams» (404, хабы), «no sign-up needed» (/train/), «Free HSK 4 writing drill», isAccessibleForFree:true в JSON-LD тестов и «Free online HSK 4 practice tests» в WebApplication/LearningResource-разметке хаба /exams/ — при фактическом гейте подписки. Обновлять копирайт или это осознанный SEO-компромисс?
6. **Hero-клейм «HSK 5+»** при полном курсе только для HSK 4 (бейдж «Full course» лишь на панели HSK 4). Позиционирование через сертификаты студентов или несоответствие?
7. **Источники соцдоказательств.** 12 400+ студентов, 38 000+ секций, 4.8★, «1,200+ verified reviews» — литералы в HTML лендинга; цифры воронки («1000 learners», «80% pass rate», «857 started this week») централизованы в OB_CONFIG.placeholders (один JSON-ключ). Кто и по какому процессу их обновляет, и что является их подтверждаемым источником?
8. **README/лицензия vs платная модель.** Футеры обещают «100% free… no subscription» (вставлено fix-rebrand.py), README — «free account», лицензия CC BY-NC-SA на контент, футер ссылается на публичный GitHub-репозиторий с исходным датасетом. Привести в соответствие с платной моделью или это осознанная «открытая» часть продукта?

### Б. Гейтинг и SEO

9. **Целевая политика «индексируем, но гейтим» — частично РЕШЕНО (O5, 2026-07-23).** ~598 `body.app` страниц остаются SEO-поверхностью (schema.org, индексируемы) и закрыты клиентским auth+sub-гейтом. Владелец подтвердил **no freemium** → контент публичным НЕ делаем (вариант «открыть 441 страницу иероглифов / C1» отклонён), гейт не трогаем; sitemap урезан до одного лендинга, чтобы не рекламировать soft-404 (см. §13.1/13.5). Остаточно открыто: страницы всё ещё достижимы краулером по внутренним ссылкам (принятый non-goal) — если это станет проблемой, отдельный вопрос про noindex.
10. **46 страниц с canonical на hsk4.mandarinzone.com** (все рукописные хабы/guide/strategies/compare/11 grammar/9 custom words); эти URL после O5 уже не в sitemap, но остаются индексируемыми. Чиним точечным sed или учим build.js переписывать head рукописных страниц?
11. **Транскрипты официальных бумаг** — шаблон пишет их публичными, но пост-обработка загоняет под гейт. Это SEO-ресурс или платный контент?
12. **441 детальная страница иероглифов** — body без .app при вшитом сайдбаре: не подключается dashboard.css (стили сайдбара), не ставится анти-flash класс, но auth-guard срабатывает. Осознанный «деградированный» режим или регрессия?
13. **robots.txt и AI-боты**: комментарий «Slow crawl down for AI-only bots», директивы — безусловный Allow. Какова целевая политика: разрешить / замедлить / запретить?
14. **CTA-баннеры хабов** («Take a Mock Exam →», addTestLinksToHubs/addGrammarCrossLinks) ведут на «/», который с 2026-07-03 — маркетинговый лендинг, а не список экзаменов. Перенаправить на /exams/?

### В. Контент и данные

15. **topics.json**: файл правился вручную после генерации (тема history есть в файле, отсутствует в скрипте; stats рассинхронизированы), перезапуск classify_topics.py затрёт правки. Канонический процесс — файл ведётся руками, или скрипт синхронизировать?
16. **Файлы-сироты**: official-characters.json и scripts/all_words.txt (981-строчный pipe-словарь) не читаются ни одним кодом. Эталоны-справочники или удалить/подключить?
17. **Захардкоженные счётчики**: «43 confusable pairs» (при 44), «156 questions», «14 grammar topics», «31 Topics / 77 Sub-topics» в hero. Выводить из данных, как TEST_COUNT?
18. **Лимит ti<12**: блоки «真题示例» на страницах words/topics/grammar сканируют только тесты 01–12 — официальные 13–14 исключены. Намеренно (не цитировать официальные бумаги) или устаревший хардкод?
19. **test-04 (99) и test-07 (76 вопросов)** — достраиваются до 100 или постоянное состояние?
20. **explanation только в test-01** (55 разборов). Планируется ли покрытие остальных 13 тестов?
21. **Аудио-пары в тестах 01–12**: у второго вопроса пары нет поля audio — плеер не показывает аудио вовсе; пользователь должен вернуться назад. Наследовать клип предыдущего вопроса?
22. **writing_construction в плеере** — везде рендерится как выбор варианта с проверкой по correct_answer_index. Для 完成句子 (Q86-95, варианты-перестановки) это осмысленно; но для 看图造句, где options — набор равноценных образцовых ответов с одним отмеченным «правильным» (test-01 Q96-100: 8–25 образцов), выбор любого другого корректного образца засчитывается ошибкой. Какова задуманная механика оценки writing в интерактивном режиме?
23. **Внешний медиахост**: 509 аудио на media.mandarinzone.com + 45 картинок по **HTTP** (mixed content, браузеры блокируют/апгрейдят). От него зависит не только платный контент, но и **pre-payment шаг воронки** — listening-вопрос диагностики s13 играет с этого же хоста (запечён в quiz/index.html). План миграции на свой хостинг (по образцу локальных /test/13/)?
24. **Дриллы старого формата**: /writing/ описывает формат 2026, а sentence-order/picture-templates кормятся заданиями 完成句子/看图造句 старых бумаг H41220/H41221 с подписью «Official HSK 4 paper». Долгосрочная стратегия или временно до появления бумаг нового формата?
25. **traps.json хранит готовый HTML** (единственный из data-файлов с презентацией и inline-обработчиками в данных). Осознанный формат или долг на нормализацию?
26. **Тройки confusables** (chengji-chengguo-chengjiu и др.): поле wordC поддержано кодом, но отсутствует в данных — третье слово живёт только в slug/subtitle. Планируется полноценная поддержка?
27. **Префикс-проверка** fill-упражнений на грамматике (`ans.indexOf(val) === 0`): один первый иероглиф уже засчитывается как «Correct» (build.js:3110). Послабление для составных ответов или дефект?
28. **Персистентность тренажёров**: /train/ обещает «progress saved», но mixed practice, complete-sentence, sentence-order, квизы тем и recall предложений ничего не сохраняют (сохраняют только плеер, словарь, 看图造句 и гайд). Должны ли остальные дриллы писать прогресс?
29. **Карточки тестов в /train/** ведут на статические /test/NN/, а результаты пишет только плеер /exams/?start= — обещание «last score on each» не замыкается в один клик. Вести сразу в плеер?
30. **9 customHtml-страниц words + buguan-dou**: не перегенерируются, изменения общего шаблона до них не доходят. Допустимый дрейф или нужен процесс синхронизации?

### Г. Auth, платежи, приватность

31. **Аккаунты до оплаты**: email-гейт s17 создаёт аккаунт самим фактом ввода email (shouldCreateUser=true). Ожидаемо ли накопление неоплаченных аккаунтов, нужна ли политика очистки?
32. **Поллинг entitlement ~6 секунд** (6×1с) — заведомо меньше типичной задержки вебхука эквайринга; расчёт на self-heal при следующем визите. Увеличить окно или осознанный компромисс?
33. **Email в query-string эквайринга** (PII в адресной строке/логах). Требование контракта StudyBox или можно передавать иначе?
34. **Контроль сумм**: сумма не передаётся в URL и не проверяется в вебхуке (amount — audit-only); фактическую сумму определяет StudyBox по plan. Есть ли внешний контроль соответствия маппинга план→сумма PLAN_MAP (7990/13990/19990)?
35. **simulatePayment при сконфигурированном Supabase без pay.checkoutUrl**: пользователь получает локальную «active»-подписку, которую сервер не признает → выброс на ?sub=required. Допустимый режим деградации при ошибке конфига?
36. **Вебвизор без маскировки на /login/** (поля email/кода/пароля) и **Метрика на /admin/** вопреки комментарию «no third-party scripts on this page by design». Маскировать/убирать?
37. **Вход по magic-link** (клик по ссылке из письма) не фиксирует цель auth (маркер ставят только signIn/Google/verifyOtp). Пробел в трекинге или осознанно?
38. **oauth_error=1**: auth.js уводит на /quiz/?oauth_error=1, но параметр никем не читается. Задумывалось сообщение об ошибке в воронке?
39. **Легаси ?signin=1** и цель signin_required — гард теперь шлёт на /login/?next=. Оставить для старых ссылок или удалить?
40. **Enumeration protection**: распознавание «No account found» на /login/ требует выключенной защиты от перебора email в Supabase (протокол QA-верифицирован 2026-07-06). Зафиксировать в ТЗ как требование к конфигурации: удобство > анти-enumeration?
41. **Google-вход из воронки с активной подпиской** возвращает в /quiz/ (next='/quiz/'), а не в /exams/ (спасает только self-heal). Желаемое поведение?
42. **profiles.email не синхронизируется** при смене email в auth (триггер только after insert), хотя комментарий схемы обещает синхронизацию. Недоделка?
43. **Админ-панель**: months-override без серверного верхнего капа (клиентский max=120); custom-сроки записываются как plan '12mo'; findUserByEmail упирается в 5000 пользователей. Приемлемые ограничения на текущем масштабе?
44. **HSKAuth.signUp** (email+password регистрация) не имеет call sites. Оставить в API или мёртвый код?
45. **Продуктовая аналитика ядра**: плеер экзаменов и все тренажёры не шлют ни одной цели (старт/завершение теста, результат). Планируются ли события за пределами воронки покупки?

### Д. Операционка и репозиторий

46. **config/auth.js закоммичен** вопреки README «gitignored» (anon key публичен по природе, но процессно это расхождение). Добавить в .gitignore и поправить README, или коммит осознан?
47. **CLAUDE.md/CNAME утверждают GitHub Pages**, фактический хостинг — DigitalOcean App Platform. Обновить CLAUDE.md, удалить CNAME?
48. **README рассинхронизирован**: таблица 12 тестов и «12 套» при 14 в данных; Quick Start клонирует чужой репозиторий (Make-dream-clear/hsk4-mock-exam) вместо rashidm19/hsk; тип «choice» описан, writing_construction/transcript/listening_audio — нет. Обновить под текущую схему?
49. **api/leads.js** — мёртвый стаб (форма-потребитель закомментирована). Включать лидогенерацию (и где будет жить обработчик на статическом хостинге) или удалить?
50. **Поиск в топбаре** — disabled input «Search tests, vocabulary…». Запланированная фича или убрать?
51. **Два untracked плана** (dedicated-login-flow, passwordless-provisioning) полностью реализованы, но не закоммичены. Закоммитить как документацию или удалить?
52. **Мёртвый/двойной код в шаблонах**: DRILL_HEADER целиком вырезается injectAppShell (мёртв), в DRILL_FOOTER задублирована кнопка GitHub, тип вопроса 'choice' нигде не встречается, `wordC`/`signUp` не используются, токены DYN.plan/DYN.discount/DYN.name мертвы, placeholders.authority_logos пуст (блок логотипов s4 не рендерится), starter_kit — незаполненный плейсхолдер, ключ trustBadges поддержан кодом без данных. Чистим?
