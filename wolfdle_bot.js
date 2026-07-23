import 'dotenv/config';
import wolfjs from 'wolf.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

process.env.SUPPRESS_NO_CONFIG_WARNING = 'true';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ==================================================
// نظام تنظيف الكونسول (Console Cleanup)
// ==================================================
const originalLog = console.log.bind(console);
const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);

const HIDE_LOGS = [
  '[DEBUG]', '[WARN]', 'DEBUG', 'WARN', 'CleanUp', 'Synchronise',
  'GroupAudioCountUpdated', 'MessageUpdate', 'Websocket', 'TipAdd',
  'Message from self ignoring', 'Store Reset', 'apiKey will be required',
  'APIKey will be required', 'No configurations found',
  'SUPPRESS_NO_CONFIG_WARNING', 'Logged in [profile:',
  'channel that was not cached', 'privateMessageSubscription',
  'channelMessageSubscription', 'tipChannelSubscription'
];

function shouldHide(text) {
  return HIDE_LOGS.some(word => text.includes(word));
}

console.log = (...args) => {
  const text = args.map(String).join(' ');
  if (!shouldHide(text)) originalLog(...args);
};
console.info = console.log;
console.debug = console.log;

console.warn = (...args) => {
  const text = args.map(String).join(' ');
  if (!shouldHide(text)) originalWarn(...args);
};

console.error = (...args) => {
  const text = args.map(String).join(' ');
  if (!shouldHide(text)) originalError(...args);
};

// ==================================================
// الإعدادات
// ==================================================
const { WOLF } = wolfjs;

const ROOM_ID = 82038178;
const WOLFDLE_BOT_ID = 82641759;
const START_COMMAND = '!كلمات';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==================================================
// تحميل قاموس الكلمات (5 حروف، مطبّع: ة → ه، همزات الألف → ا)
// ==================================================
const WORDLIST_PATH = path.join(__dirname, 'ar_words5.txt');
let DICTIONARY = [];
try {
  DICTIONARY = fs.readFileSync(WORDLIST_PATH, 'utf8')
    .split('\n')
    .map(w => w.trim())
    .filter(w => w.length === 5);
  console.log(`📚 تم تحميل ${DICTIONARY.length} كلمة من القاموس.`);
} catch (err) {
  console.error('❌ فشل تحميل ملف القاموس ar_words5.txt:', err.message);
}

// ==================================================
// قاعدة بيانات "الكلمات المتعلّمة" (الكلمات الصحيحة اللي عرفناها من جولات سابقة)
// بتتخزن على القرص وبترجع تتحمل تاني كل ما البوت يشتغل، عشان يبني معرفة تراكمية
// بدل ما يعتمد بس على القاموس الجاهز.
// ==================================================
const LEARNED_WORDS_PATH = path.join(__dirname, 'learned_words.json');
let LEARNED_WORDS = new Set();

function normalizeWord(w) {
  return String(w || '')
    .replace(/ة/g, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670]/g, '') // إزالة التشكيل
    .trim();
}

function loadLearnedWords() {
  try {
    if (fs.existsSync(LEARNED_WORDS_PATH)) {
      const data = JSON.parse(fs.readFileSync(LEARNED_WORDS_PATH, 'utf8'));
      if (Array.isArray(data)) LEARNED_WORDS = new Set(data.map(normalizeWord).filter(w => w.length === 5));
    }
    console.log(`🧠 تم تحميل ${LEARNED_WORDS.size} كلمة اتعلمناها من جولات سابقة.`);
  } catch (err) {
    console.error('❌ فشل تحميل ملف الكلمات المتعلمة:', err.message);
  }
}

function saveLearnedWord(rawWord) {
  const word = normalizeWord(rawWord);
  if (!word || word.length !== 5) return;
  if (LEARNED_WORDS.has(word)) return;
  LEARNED_WORDS.add(word);
  try {
    fs.writeFileSync(LEARNED_WORDS_PATH, JSON.stringify([...LEARNED_WORDS], null, 2), 'utf8');
    console.log(`💾 اتحفظت كلمة جديدة محليًا: ${word} (إجمالي الكلمات المتعلمة: ${LEARNED_WORDS.size})`);
  } catch (err) {
    console.error('❌ فشل حفظ الكلمة المتعلمة محليًا:', err.message);
    return;
  }
  // ارفع التحديث فورًا لريبو GitHub (لو شغالين جوه GitHub Actions)
  // عشان الكلمة متتفقدش أبدًا حتى لو الـ job اتقفل فجأة قبل نهاية الجلسة
  commitLearnedWordsToRepo().catch(err => console.log('⚠️ فشل رفع الكلمة للريبو:', err.message));
}

// ==================================================
// رفع ملف الكلمات المتعلمة للريبو مباشرة (commit + push) فور تعلّم كلمة جديدة،
// بدل ما ننتظر لحد ما الجلسة تخلص. بيشتغل بس جوه GitHub Actions.
// ==================================================
function runGitCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd: __dirname }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message)); else resolve(stdout);
    });
  });
}

function hasStagedGitChanges() {
  return new Promise((resolve) => {
    exec('git diff --cached --quiet', { cwd: __dirname }, (err) => {
      resolve(!!err); // git diff --quiet بيرجع كود خروج 1 لو فيه تغييرات
    });
  });
}

function setupGitIdentityIfNeeded() {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  exec(
    'git config user.name "github-actions[bot]" && git config user.email "github-actions[bot]@users.noreply.github.com"',
    { cwd: __dirname },
    () => {}
  );
}

let gitCommitBusy = false;
let gitCommitPending = false;

async function commitLearnedWordsToRepo() {
  if (process.env.GITHUB_ACTIONS !== 'true') return; // بس جوه GitHub Actions فيه صلاحية push
  if (gitCommitBusy) { gitCommitPending = true; return; }
  gitCommitBusy = true;
  try {
    await runGitCommand('git add learned_words.json');
    const changed = await hasStagedGitChanges();
    if (changed) {
      await runGitCommand('git commit -m "chore: تحديث الكلمات المتعلمة [skip ci]"');
      await runGitCommand('git push');
      console.log('☁️ اتحفظت الكلمة الجديدة في الريبو مباشرة (commit + push).');
    }
  } catch (err) {
    console.log('⚠️ فشل رفع الكلمات المتعلمة للريبو:', err.message);
  } finally {
    gitCommitBusy = false;
    if (gitCommitPending) {
      gitCommitPending = false;
      commitLearnedWordsToRepo();
    }
  }
}

loadLearnedWords();
setupGitIdentityIfNeeded();

// تقدير تكراري تقريبي لحروف اللغة العربية (لأولوية الاستكشاف والاختيار)
const LETTER_FREQ = {
  'ا': 1.00, 'ل': 0.95, 'ي': 0.85, 'م': 0.80, 'و': 0.78, 'ن': 0.75,
  'ر': 0.70, 'ت': 0.68, 'ب': 0.60, 'ه': 0.58, 'س': 0.55, 'ع': 0.50,
  'د': 0.48, 'ك': 0.46, 'ق': 0.44, 'ح': 0.42, 'ج': 0.40, 'ف': 0.38,
  'ص': 0.35, 'ط': 0.33, 'ض': 0.30, 'ش': 0.28, 'خ': 0.25, 'ز': 0.22,
  'ذ': 0.20, 'غ': 0.15, 'ث': 0.18, 'ظ': 0.10, 'ء': 0.10
};

function wordScore(word, testedLetters) {
  const distinct = new Set(word);
  let score = 0;
  for (const L of distinct) {
    const freq = LETTER_FREQ[L] ?? 0.1;
    score += testedLetters.has(L) ? freq * 0.15 : freq; // نفضّل حروف لسه ما اتجربتش
  }
  score += distinct.size * 0.3; // نكافئ تنوع الحروف (تقليل التكرار)
  return score;
}

// تسلسل ثابت لتجربة الحروف العشوائية (5 تخمينات تغطي 25 حرف مختلف بدون تكرار)
const FIXED_PROBES = ['المنت', 'وربيس', 'عغفقه', 'دجحخك', 'ظطصضز'];

// ==================================================
// قائمة "حرق" الجولة: لما مفيش أي تخمين منطقي ممكن نبنيه (5/5 حروف معروفة
// بس مفيش كلمة تطابق القيود، أو تعارض في القيود نفسها)، بدل ما نكرر نفس
// الكلمة الاحتياطية "ابجده" أكتر من مرة (ممكن اللعبة ترفضها كتكرار وتضيع
// محاولة من غير فايدة)، نبعت كلمات بسيطة مختلفة (حرف واحد مكرر 5 مرات)
// لحد ما الصف يوصل 6 والجولة تنتهي وتظهرلنا الكلمة الصحيحة.
// ==================================================
const BURN_LETTERS = ['ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي'];

function pickBurnGuess(guessedSet) {
  for (const L of BURN_LETTERS) {
    const w = L.repeat(5);
    if (!guessedSet.has(w)) return w;
  }
  return null;
}

// إجمالي الخانات "الملوّنة" (أخضر + أصفر) في كل الصفوف لحد دلوقتي
function totalMatchedCells(rows) {
  let total = 0;
  for (const row of rows) {
    for (const cell of row) {
      if (cell.status === 'correct' || cell.status === 'incorrect') total++;
    }
  }
  return total;
}

// ==================================================
// حالة اللعبة
// ==================================================
let client = null;
let isBotReady = false;

let gameRows = [];          // كل صف: [{letter, status}, ...] بترتيب التخمين
let processedMessageIds = new Set();
let isGameOver = false;
let isSending = false;
let pendingRecheck = false; // هل وصل تحديث للوحة أثناء انشغالنا بالإرسال ولازم نعيد فحصه؟
let firstGuessSent = false; // هل بعتنا أول تخمين في الجولة الحالية؟
let restartTimer = null;

function resetGameState() {
  gameRows = [];
  isGameOver = false;
  isSending = false;
  pendingRecheck = false;
  firstGuessSent = false;
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
}

// ==================================================
// تحليل HTML اللعبة (استخراج الصفوف والحالات)
// ==================================================
function parseBoard(html) {
  const itemRegex = /<div class="wolfdlebot-mp-game__content__container__item ([\w-]+)"[^>]*>([^<]*)<\/div>/g;
  const cells = [];
  let m;
  while ((m = itemRegex.exec(html))) {
    cells.push({ status: m[1], letter: (m[2] || '').trim() });
  }
  const colMatch = html.match(/--columns:(\d+)/);
  const columns = colMatch ? parseInt(colMatch[1], 10) : 5;

  const rows = [];
  for (let i = 0; i < cells.length; i += columns) {
    const rowCells = cells.slice(i, i + columns);
    if (rowCells.length < columns) continue;
    if (rowCells.some(c => c.status === 'border-only')) continue; // صف لسه فاضي
    rows.push(rowCells);
  }
  return rows;
}

function isWinningRow(row) {
  return row.length === 5 && row.every(c => c.status === 'correct');
}

// ==================================================
// محرك التحليل والاستنتاج (منطق Wordle)
// ==================================================
function analyzeRows(rows) {
  const greens = Array(5).fill(null);
  const excludedAt = Array.from({ length: 5 }, () => new Set());
  const minCount = {};
  const maxCount = {};
  const testedLetters = new Set();
  const guessedWords = [];

  for (const row of rows) {
    const word = row.map(c => c.letter).join('');
    guessedWords.push(word);

    const matchedCounts = {};
    const grayLetters = new Set();

    for (const cell of row) {
      testedLetters.add(cell.letter);
      if (cell.status === 'correct' || cell.status === 'incorrect') {
        matchedCounts[cell.letter] = (matchedCounts[cell.letter] || 0) + 1;
      }
      if (cell.status === 'invalid') grayLetters.add(cell.letter);
    }

    row.forEach((cell, idx) => {
      const L = cell.letter;
      if (cell.status === 'correct') {
        greens[idx] = L;
      } else if (cell.status === 'incorrect') {
        excludedAt[idx].add(L);
      } else if (cell.status === 'invalid') {
        excludedAt[idx].add(L);
      }
    });

    for (const L of new Set(row.map(c => c.letter))) {
      const matched = matchedCounts[L] || 0;
      if (matched > 0) minCount[L] = Math.max(minCount[L] || 0, matched);
      if (grayLetters.has(L)) maxCount[L] = Math.min(maxCount[L] ?? Infinity, matched);
    }
  }

  return { greens, excludedAt, minCount, maxCount, testedLetters, guessedWords };
}

function wordMatchesConstraints(word, state) {
  const letters = [...word];
  for (let i = 0; i < 5; i++) {
    if (state.greens[i] && letters[i] !== state.greens[i]) return false;
    if (state.excludedAt[i].has(letters[i])) return false;
  }
  const counts = {};
  for (const L of letters) counts[L] = (counts[L] || 0) + 1;
  for (const [L, min] of Object.entries(state.minCount)) {
    if ((counts[L] || 0) < min) return false;
  }
  for (const [L, max] of Object.entries(state.maxCount)) {
    if ((counts[L] || 0) > max) return false;
  }
  return true;
}

function pickNextGuess(rows) {
  const matched = totalMatchedCells(rows);
  const stillProbing = rows.length < FIXED_PROBES.length && matched < 5;

  if (stillProbing) {
    const nextProbe = FIXED_PROBES[rows.length];
    console.log(`🔤 وضع تجربة الحروف (${rows.length + 1}/${FIXED_PROBES.length}) | خانات ملوّنة لحد الآن: ${matched}/5 | التخمين: ${nextProbe}`);
    return nextProbe;
  }

  // إما لقينا 5 خانات ملوّنة (كل حروف الكلمة معروفة)، أو خلّصنا الـ5 تخمينات الجاهزة
  const state = analyzeRows(rows);
  const guessedSet = new Set(state.guessedWords);

  // أولوية قصوى: كلمات عرفنا قبل كده إنها كانت الحل الصحيح في جولات سابقة وبتطابق القيود الحالية
  const learnedCandidates = [...LEARNED_WORDS].filter(w =>
    !guessedSet.has(w) && wordMatchesConstraints(w, state)
  );
  if (learnedCandidates.length > 0) {
    const pick = learnedCandidates[0];
    console.log(`🧠 لقينا ${learnedCandidates.length} كلمة من ذاكرتنا بتطابق القيود، هنجرب: ${pick}`);
    return pick;
  }

  const candidates = DICTIONARY.filter(w =>
    !guessedSet.has(w) && wordMatchesConstraints(w, state)
  );

  const attemptsLeft = 6 - rows.length;

  if (candidates.length === 0) {
    console.log(`⚠️ لا توجد كلمة في القاموس تطابق القيود الحالية (وجدنا ${matched}/5 حروف). هدوّر على أقرب حل ممكن.`);
    const scored = DICTIONARY
      .filter(w => !guessedSet.has(w))
      .map(w => ({ w, s: partialMatchScore(w, state) }))
      .filter(x => x.s > -Infinity) // استبعد أي كلمة بتخالف قيد مؤكد (حرف لازم يكون موجود/غير موجود)
      .sort((a, b) => b.s - a.s);
    if (scored.length > 0) {
      console.log(`🧩 مفيش كلمة كاملة الشروط، بس دي أقرب كلمة منطقية من القاموس: ${scored[0].w}`);
      return scored[0].w;
    }

    // القاموس (433 كلمة) ناقص الكلمة الصحيحة على الأرجح. بدل ما نستسلم بتخمين عشوائي،
    // نبني إحنا كلمة بأيدينا تحترم كل القيود المؤكدة: نثبّت الحروف الخضراء، نحط الحروف
    // الصفراء في خانات فاضية ميتستبعدوش منها، ونملأ أي خانة لسه مجهولة بحرف عالي التكرار
    // لسه ما اتجربش (عشان لو الكلمة اتقبلت من اللعبة تجيب معلومة جديدة، ولو اترفضت
    // منخسرش حاجة غير المحاولة).
    console.log('⚠️ القاموس ناقص الكلمة الصحيحة على الأرجح — هبني تخمين بنفسي من الحروف المؤكدة.');
    const built = buildConstraintGuess(state, guessedSet);
    if (built) {
      console.log(`🛠️ تخمين مبني يدويًا من القيود المؤكدة: ${built}`);
      return built;
    }

    // مفيش أي طريقة منطقية نبني بيها تخمين (تعارض في القيود، أو كل الاحتمالات
    // اتجربت). بدل ما نكرر نفس التخمين الاحتياطي، نحرق باقي المحاولات بكلمات
    // بسيطة مختلفة (حرف واحد مكرر) لحد ما الجولة تنتهي طبيعيًا.
    console.log('❌ مقدرتش أبني تخمين منطقي من القيود المتاحة — هحرق باقي المحاولات بتخمينات بسيطة.');
    const burn = pickBurnGuess(guessedSet);
    if (burn) return burn;
    return 'ابجده'; // احتياطي أخير لو كل حروف الحرق اتجربت (نادر جدًا)
  }

  if (candidates.length === 1 || attemptsLeft <= 1) {
    return candidates[0];
  }

  let best = candidates[0], bestScore = -Infinity;
  for (const w of candidates) {
    const s = wordScore(w, state.testedLetters);
    if (s > bestScore) { bestScore = s; best = w; }
  }
  console.log(`🧩 احتمالات متبقية: ${candidates.length} | التخمين المختار: ${best}`);
  return best;
}

// يبني تخمين "من الصفر" ملتزم بكل القيود المؤكدة لحد دلوقتي، حتى لو الكلمة الناتجة
// مش موجودة في قاموسنا المحلي (433 كلمة قد ميغطيش كل الكلمات الحقيقية).
// مثال: لو عرفنا إن الكلمة بتبدأ بـ "ال" وفيها "ر" و"ك" في مكان مجهول، والحرف
// الخامس لسه غير معروف، الدالة دي بتحط "ر" و"ك" في الخانات الفاضية المسموحة،
// وتملأ أي خانة لسه فاضية بحرف عالي التكرار لسه ما اتجربش.
function buildConstraintGuess(state, guessedSet) {
  const { greens, excludedAt, minCount, maxCount, testedLetters } = state;
  const slots = greens.slice(); // null = خانة مجهولة، وإلا الحرف الأخضر المؤكد

  // 1) احسب كام مرة لسه محتاجين نحط كل حرف "لازم يكون موجود" (أصفر/أخضر) في الخانات المجهولة
  const remainingNeeded = {};
  for (const [L, min] of Object.entries(minCount)) {
    const alreadyPlaced = slots.filter(s => s === L).length;
    const need = min - alreadyPlaced;
    if (need > 0) remainingNeeded[L] = need;
  }
  const emptySlots = () => slots.map((s, i) => (s === null ? i : -1)).filter(i => i !== -1);

  // رتّب الحروف المطلوبة الأكثر إلحاحًا (المطلوب تكرارها أكتر) الأول
  const neededLetters = Object.entries(remainingNeeded).sort((a, b) => b[1] - a[1]);
  for (const [L, count] of neededLetters) {
    for (let n = 0; n < count; n++) {
      const openSlots = emptySlots().filter(i => !excludedAt[i].has(L));
      if (openSlots.length === 0) return null; // تعارض في القيود، مينفعش نبني تخمين منطقي
      slots[openSlots[0]] = L;
    }
  }

  // 2) املأ أي خانة لسه فاضية بحرف عالي التكرار لسه ما اتجربش، وميكونش مستبعد كليًا
  const fullyExcluded = new Set(
    Object.entries(maxCount).filter(([, max]) => max === 0).map(([L]) => L)
  );
  const usedCounts = {};
  for (const s of slots) if (s) usedCounts[s] = (usedCounts[s] || 0) + 1;

  for (const i of emptySlots()) {
    const options = Object.keys(LETTER_FREQ)
      .filter(L => !excludedAt[i].has(L))
      .filter(L => !fullyExcluded.has(L))
      .filter(L => (usedCounts[L] || 0) < (maxCount[L] ?? Infinity))
      .sort((a, b) => {
        const aTested = testedLetters.has(a) ? 1 : 0;
        const bTested = testedLetters.has(b) ? 1 : 0;
        if (aTested !== bTested) return aTested - bTested; // نفضّل حروف لسه ما اتجربتش
        return (LETTER_FREQ[b] ?? 0) - (LETTER_FREQ[a] ?? 0);
      });
    if (options.length === 0) return null;
    slots[i] = options[0];
    usedCounts[options[0]] = (usedCounts[options[0]] || 0) + 1;
  }

  if (slots.some(s => !s)) return null;
  const word = slots.join('');
  if (guessedSet.has(word)) return null;
  return word;
}

function partialMatchScore(word, state) {
  const letters = [...word];
  const counts = {};
  for (const L of letters) counts[L] = (counts[L] || 0) + 1;

  // أي مخالفة لقيد مؤكد (حرف أخضر/أصفر لازم يكون موجود، أو حرف رمادي لازم ميكونش موجود
  // بالعدد ده) بتلغي الكلمة تمامًا — مينفعش نرشحها حتى لو باقي حروفها كويسة.
  for (const [L, min] of Object.entries(state.minCount)) {
    if ((counts[L] || 0) < min) return -Infinity;
  }
  for (const [L, max] of Object.entries(state.maxCount)) {
    if ((counts[L] || 0) > max) return -Infinity;
  }

  let score = 0;
  for (let i = 0; i < 5; i++) {
    if (state.greens[i] && letters[i] === state.greens[i]) score += 10;
    if (state.excludedAt[i].has(letters[i])) score -= 5;
  }
  return score;
}

// ==================================================
// إرسال التخمين
// ==================================================
async function sendGuess(word) {
  if (!client || !isBotReady || isGameOver) return;
  isSending = true;
  const delay = Math.floor(Math.random() * (1600 - 900 + 1)) + 900;
  console.log(`✨ هبعت التخمين: [ ${word} ] بعد ${delay}ms`);
  await sleep(delay);
  try {
    await client.messaging.sendGroupMessage(ROOM_ID, word);
  } catch (err) {
    console.log('⚠️ فشل إرسال التخمين:', err.message);
  } finally {
    setTimeout(() => {
      isSending = false;
      // لو وصل تحديث للوحة أثناء ما كنا مشغولين بالإرسال، لازم نعيد فحصه دلوقتي
      // بدل ما نسيبه يضيع للأبد ويوقف البوت عن الرد.
      if (pendingRecheck) {
        pendingRecheck = false;
        recheckBoardNow();
      }
    }, 800);
  }
}

async function recheckBoardNow() {
  if (isGameOver || isSending || !isBotReady) return;
  if (gameRows.length === 0) return;
  const lastRow = gameRows[gameRows.length - 1];
  if (isWinningRow(lastRow)) return; // اتعالجت بالفعل في مكانها
  if (gameRows.length >= 6) return;
  const guess = pickNextGuess(gameRows);
  if (guess) await sendGuess(guess);
}

async function sendGroupMessage(roomId, text) {
  if (!client || !isBotReady) return;
  try { await client.messaging.sendGroupMessage(roomId, text); } catch {}
}

// أول تخمين في الجولة: لازم يتبعت لوحده فور ما اللعبة تبدأ (اللوحة بتكون فاضية
// ومفيش أي رسالة هتخلي الكود "يستنتج" إنه يبعت، فلازم نبعته احنا استباقيًا).
async function sendFirstGuessIfNeeded() {
  if (firstGuessSent || isGameOver || isSending || !isBotReady) return;
  firstGuessSent = true;
  const guess = pickNextGuess([]);
  if (guess) await sendGuess(guess);
}

// ==================================================
// معالجة الرسائل الواردة من بوت WOLFdle
// ==================================================
function scheduleNewGame(reason, delayMs = 15000) {
  if (restartTimer) return;
  console.log(`🏁 ${reason} — هتبدأ جولة جديدة بعد ${delayMs / 1000} ثوانٍ.`);
  restartTimer = setTimeout(async () => {
    restartTimer = null;
    resetGameState();
    await sendGroupMessage(ROOM_ID, START_COMMAND);
    await sleep(2000);
    await sendFirstGuessIfNeeded();
  }, delayMs);
}

async function handleWolfdleMessage(message) {
  // رقم الروم اللي جاية منه الرسالة (تأكدنا إن targetGroupId هو الحقل الصحيح)
  const messageRoomId = message.targetGroupId ?? message.groupId ?? null;

  // نتجاهل أي رسالة مش من روم اللعبة قبل أي معالجة أو تسجيل
  if (!message.isGroup) return;
  if (messageRoomId !== null && Number(messageRoomId) !== ROOM_ID) return;

  // تسجيل تشخيصي اختياري (متوقف افتراضيًا) — يتفعّل فقط بتفعيل DEBUG_WOLFDLE=true
  if (process.env.DEBUG_WOLFDLE === 'true') {
    originalLog(
      `🔍 [DEBUG] event | id=${message.id} | sourceSubscriberId=${message.sourceSubscriberId} | roomId=${messageRoomId} | type=${message.type || message.mimeType || '?'} | bodyLen=${(message.body || '').length}`
    );
  }

  if (Number(message.sourceSubscriberId) !== WOLFDLE_BOT_ID) return;

  const mime = message.type || message.mimeType || '';
  const body = message.body || '';
  const isBoardMessage = body.includes('wolfdlebot-mp-game');

  // 1) رسالة نصية (بداية/نهاية لعبة أو تنبيه)
  // بنستخدم فلتر تكرار الـ id هنا بس، عشان الرسايل النصية دي بتتبعت مرة واحدة فعلاً
  if (!isBoardMessage || mime.includes('text/plain')) {
    if (processedMessageIds.has(message.id)) return;
    processedMessageIds.add(message.id);
    if (processedMessageIds.size > 500) {
      processedMessageIds = new Set([...processedMessageIds].slice(-250));
    }

    const text = body;
    if (text.includes('انتهت اللعبة') || text.includes('فشلت') || text.includes('أحسنت') || text.includes('فزت') || text.includes('مبروك')) {
      isGameOver = true;
      const match = text.match(/الكلمة\s*'([^']+)'/);
      if (match) {
        console.log(`📖 الكلمة الصحيحة كانت: ${match[1]}`);
        saveLearnedWord(match[1]);
      }
      scheduleNewGame('انتهت الجولة');
    }
    return;
  }

  // 2) رسالة HTML فيها لوحة اللعبة
  // ملحوظة مهمة: WOLFdle بيعدّل نفس الرسالة (نفس الـ id) كل ما اللوحة تتحدث،
  // فمينفعش نفلتر هنا بالـ id زي الرسايل النصية — بنعتمد بدل كده على عدد
  // الصفوف الفعلي (rows.length مقابل gameRows.length) عشان نمنع إعادة المعالجة.
  const rows = parseBoard(body);
  if (rows.length === 0) {
    // اللوحة لسه فاضية (اللعبة بدأت للتو) — ده وقت إرسال أول تخمين لوحدنا
    await sendFirstGuessIfNeeded();
    return;
  }

  if (rows.length <= gameRows.length) return; // نفس عدد الصفوف أو أقل، متعالجش تاني
  gameRows = rows;
  firstGuessSent = true; // أكيد بقى في تخمين واحد على الأقل اتبعت

  const lastRow = rows[rows.length - 1];
  if (isWinningRow(lastRow)) {
    const solvedWord = lastRow.map(c => c.letter).join('');
    console.log(`🏆 الكلمة اتخمنت صح: ${solvedWord}! في انتظار رسالة نهاية الجولة...`);
    saveLearnedWord(solvedWord);
    isGameOver = true;
    scheduleNewGame('فوز! تم تخمين الكلمة');
    return;
  }

  if (rows.length >= 6) {
    return; // اللوحة كاملة، هننتظر رسالة النهاية (فيها الكلمة الصحيحة لو خسرنا)
  }

  if (isGameOver) return;

  // لو البوت لسه مشغول ببعت تخمين سابق، منسيبش التحديث ده يضيع — نأجّل الفحص
  // لحد ما الإرسال الحالي يخلص (بدل ما نتجاهله للأبد ويوقف البوت عن الرد).
  if (isSending) { pendingRecheck = true; return; }

  const guess = pickNextGuess(rows);
  if (guess) await sendGuess(guess);
}

// ==================================================
// نظام الدخول الذكي وإعادة الاتصال
// ==================================================
let isReconnecting = false;
let readyTimeout = null;
let reconnectTimer = null;

function cleanOldClient() {
  if (!client) return;
  try { client.removeAllListeners(); } catch {}
  client = null;
}

function scheduleReconnect(reason) {
  if (isReconnecting || reconnectTimer) return;
  console.log(`⚠️ ${reason}، ستتم إعادة إنشاء الاتصال بعد 5 ثوانٍ...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    loginWithFreshClient(`إعادة الاتصال بسبب: ${reason}`);
  }, 5000);
}

async function loginWithFreshClient(reason = 'التشغيل الأول') {
  if (isReconnecting) return;
  isReconnecting = true;

  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (readyTimeout) clearTimeout(readyTimeout);

  cleanOldClient();
  isBotReady = false;

  console.log(`🔄 جاري بدء البوت — السبب: ${reason}`);
  client = new WOLF();

  client.on('message', async (message) => {
    try { await handleWolfdleMessage(message); } catch (err) { console.log('خطأ في المعالجة:', err.message); }
  });

  client.on('messageUpdate', async (message) => {
    try { await handleWolfdleMessage(message); } catch (err) { console.log('خطأ في المعالجة:', err.message); }
  });

  client.on('ready', async () => {
    isReconnecting = false;
    if (readyTimeout) clearTimeout(readyTimeout);

    console.log('✅ تم تسجيل الدخول! البوت متصل وجاهز للعب WOLFdle.');
    isBotReady = true;
    resetGameState();
    await sleep(2000);
    await sendGroupMessage(ROOM_ID, START_COMMAND);
    await sleep(2000);
    await sendFirstGuessIfNeeded();
  });

  client.on('error', (error) => {
    const errorMessage = String(error?.message || error || '').toLowerCase();
    if (
      errorMessage.includes('disconnected') ||
      errorMessage.includes('not logged in') ||
      errorMessage.includes('socket closed') ||
      errorMessage.includes('connection lost') ||
      errorMessage.includes('websocket closed')
    ) {
      isReconnecting = false;
      scheduleReconnect('انقطع اتصال العميل');
    }
  });

  client.on('disconnected', () => {
    isReconnecting = false;
    scheduleReconnect('فقدان الاتصال بالسيرفر (Disconnected)');
  });

  try {
    const loginPromise = client.login(process.env.U_MAIL, process.env.U_PASS);
    if (loginPromise && typeof loginPromise.then === 'function') {
      await loginPromise;
    }
  } catch (error) {
    isReconnecting = false;
    console.error('❌ فشل طلب تسجيل الدخول:', error?.message);
    scheduleReconnect('فشل طلب تسجيل الدخول');
    return;
  }

  readyTimeout = setTimeout(() => {
    console.log('⚠️ لم يستجب سيرفر وولف (ready) خلال المهلة، سيتم تبديل العميل.');
    isReconnecting = false;
    cleanOldClient();
    scheduleReconnect('لم يكتمل تسجيل الدخول (تعليق)');
  }, 25000);
}

// ==================================================
// بدء التشغيل
// ==================================================
console.log(`🎯 تسلسل تجربة الحروف: ${FIXED_PROBES.join(' ، ')}`);

loginWithFreshClient();

// ==================================================
// إيقاف تلقائي بلطف قبل ما GitHub Actions يقفل الـ job إجباريًا
// (الـ job الواحدة أقصى مدة ليها 6 ساعات على GitHub Actions)
// ==================================================
const MAX_RUNTIME_MS = Number(process.env.BOT_MAX_RUNTIME_MS) || 4 * 60 * 60 * 1000; // 4 ساعات افتراضيًا

if (process.env.GITHUB_ACTIONS === 'true' || process.env.BOT_MAX_RUNTIME_MS) {
  setTimeout(async () => {
    console.log('⏰ وصلنا للحد الأقصى للتشغيل في هذه الجلسة، هنقفل بهدوء عشان الـ workflow يقدر يحفظ التقدم ويشغّل نسخة جديدة.');
    try { if (client) client.removeAllListeners(); } catch {}
    try { if (client && client.disconnect) await client.disconnect(); } catch {}
    process.exit(0);
  }, MAX_RUNTIME_MS);
  console.log(`🛑 هيقفل البوت نفسه تلقائيًا بعد ${Math.round(MAX_RUNTIME_MS / 60000)} دقيقة عشان يفضل ضمن حدود GitHub Actions.`);
}
