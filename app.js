import 'dotenv/config';
import wolfjs from 'wolf.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
const FIXED_PROBES = ['المنت', 'وربيس', 'عغفقه', 'دجحخك', 'ظطزصض'];

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
let restartTimer = null;

function resetGameState() {
  gameRows = [];
  isGameOver = false;
  isSending = false;
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
  // ودلوقتي وقت البحث عن الترتيب الصحيح باستخدام القاموس
  const state = analyzeRows(rows);
  const guessedSet = new Set(state.guessedWords);

  const candidates = DICTIONARY.filter(w =>
    !guessedSet.has(w) && wordMatchesConstraints(w, state)
  );

  const attemptsLeft = 6 - rows.length;

  if (candidates.length === 0) {
    // ما لقيناش كلمة في القاموس تطابق كل القيود (نادر، أو لسه ناقصنا حرف من الـ5 لو matched<5)
    // نحاول أفضل تخمين متاح بالمعلومة الموجودة: نثبّت الحروف الأكيدة ونملأ الباقي بأفضل الاحتمالات
    console.log(`⚠️ لا توجد كلمة في القاموس تطابق القيود الحالية (وجدنا ${matched}/5 حروف). هحاول تخمين بأفضل ما هو متاح.`);
    const partial = DICTIONARY
      .filter(w => !guessedSet.has(w))
      .map(w => ({ w, s: partialMatchScore(w, state) }))
      .sort((a, b) => b.s - a.s)[0];
    return partial ? partial.w : 'ابجده';
  }

  if (candidates.length === 1 || attemptsLeft <= 1) {
    return candidates[0];
  }

  // لسه في أكتر من احتمال ومحاولات كفاية: نختار الكلمة اللي تدينا أكبر معلومة جديدة
  let best = candidates[0], bestScore = -Infinity;
  for (const w of candidates) {
    const s = wordScore(w, state.testedLetters);
    if (s > bestScore) { bestScore = s; best = w; }
  }
  console.log(`🧩 احتمالات متبقية: ${candidates.length} | التخمين المختار: ${best}`);
  return best;
}

// تقييم كلمة بناءً على مطابقتها الجزئية للقيود (لما مفيش كلمة تطابق كل القيود بالظبط)
function partialMatchScore(word, state) {
  const letters = [...word];
  let score = 0;
  for (let i = 0; i < 5; i++) {
    if (state.greens[i] && letters[i] === state.greens[i]) score += 10; // مكان أكيد
    if (state.excludedAt[i].has(letters[i])) score -= 5; // نتجنب وضع حرف في مكان مستبعد
  }
  const counts = {};
  for (const L of letters) counts[L] = (counts[L] || 0) + 1;
  for (const [L, min] of Object.entries(state.minCount)) {
    if ((counts[L] || 0) >= min) score += 3; // الحرف المعروف موجود
  }
  for (const [L, max] of Object.entries(state.maxCount)) {
    if ((counts[L] || 0) > max) score -= 8; // تكرار حرف معروف إنه مش متكرر
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
    setTimeout(() => { isSending = false; }, 800);
  }
}

async function sendGroupMessage(roomId, text) {
  if (!client || !isBotReady) return;
  try { await client.messaging.sendGroupMessage(roomId, text); } catch {}
}

// ==================================================
// معالجة الرسائل الواردة من بوت WOLFdle
// ==================================================
function scheduleNewGame(reason, delayMs = 5000) {
  if (restartTimer) return;
  console.log(`🏁 ${reason} — هتبدأ جولة جديدة بعد ${delayMs / 1000} ثوانٍ.`);
  restartTimer = setTimeout(async () => {
    restartTimer = null;
    resetGameState();
    await sendGroupMessage(ROOM_ID, START_COMMAND);
  }, delayMs);
}

async function handleWolfdleMessage(message) {
  if (Number(message.sourceSubscriberId) !== WOLFDLE_BOT_ID) return;
  if (!message.isGroup) return;
  if (processedMessageIds.has(message.id)) return;
  processedMessageIds.add(message.id);
  if (processedMessageIds.size > 500) {
    // منع التسريب الذاكري على المدى الطويل
    processedMessageIds = new Set([...processedMessageIds].slice(-250));
  }

  const mime = message.type || message.mimeType || '';
  const body = message.body || '';

  // 1) رسالة نصية (بداية/نهاية لعبة أو تنبيه)
  if (mime.includes('text/plain') || !body.includes('wolfdlebot-mp-game')) {
    const text = body;
    if (text.includes('انتهت اللعبة') || text.includes('فشلت') || text.includes('أحسنت') || text.includes('فزت') || text.includes('مبروك')) {
      isGameOver = true;
      const match = text.match(/الكلمة\s*'([^']+)'/);
      if (match) console.log(`📖 الكلمة الصحيحة كانت: ${match[1]}`);
      scheduleNewGame('انتهت الجولة');
    }
    return;
  }

  // 2) رسالة HTML فيها لوحة اللعبة
  const rows = parseBoard(body);
  if (rows.length === 0) return; // جولة جديدة فاضية، لسه محدش خمن

  // هل اتغير شيء عن آخر مرة شفنا فيها اللوحة؟
  if (rows.length <= gameRows.length) return; // نفس عدد الصفوف أو أقل، متعالجش تاني
  gameRows = rows;

  const lastRow = rows[rows.length - 1];
  if (isWinningRow(lastRow)) {
    console.log('🏆 الكلمة اتخمنت صح! في انتظار رسالة نهاية الجولة...');
    isGameOver = true;
    scheduleNewGame('فوز! تم تخمين الكلمة');
    return;
  }

  if (rows.length >= 6) {
    // اللوحة كاملة، هننتظر رسالة النهاية (فيها الكلمة الصحيحة لو خسرنا)
    return;
  }

  if (isGameOver || isSending) return;

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
    const loginPromise = client.login(process.env.U_MAIL_1, process.env.U_PASS_1);
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
