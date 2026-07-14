import 'dotenv/config';

process.env.SUPPRESS_NO_CONFIG_WARNING = 'true';

// ================== تنظيف الكونسول ==================
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

const stdoutWrite = process.stdout.write.bind(process.stdout);
const stderrWrite = process.stderr.write.bind(process.stderr);

process.stdout.write = (chunk, encoding, callback) => {
  if (shouldHide(String(chunk))) return true;
  return stdoutWrite(chunk, encoding, callback);
};
process.stderr.write = (chunk, encoding, callback) => {
  if (shouldHide(String(chunk))) return true;
  return stderrWrite(chunk, encoding, callback);
};

// ================== استيراد wolf.js ==================
import wolfjs from 'wolf.js';
const { WOLF } = wolfjs.default || wolfjs;

// =========================================================================
// ================== 🎮 إعدادات الحساب ==================
// =========================================================================

const TRACKED_BOT_ID = 80277459;
const RACE_ROOM_ID = 18654218;

// أوقات الانتظار
const RACE_END_TIMEOUT_MS = 120 * 1000; // دقيقتين لو علق السباق
const ENERGY_FALLBACK_MS = 11 * 60 * 1000; // 11 دقيقة لاسترجاع الطاقة

// بيانات الحساب الواحد
const ACCOUNT = {
  email: process.env.U_MAIL, // أو ضع الإيميل مباشرة هنا 'email@example.com'
  password: process.env.U_PASS, // أو ضع الباسورد هنا 'password123'
  name: 'ايلول',
  id: 25376691, // آيدي الحساب
  sChannel: 569 // روم السباق
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// =========================================================================
// ================== أدوات قراءة الرسائل ==================
// =========================================================================

function getSenderId(message) {
  return Number(message.sourceSubscriberId || message.sourceUserId || message.sourceId || message.senderId || message.userId || 0);
}

function getMessageText(message) {
  return (message.body || message.content || message.text || message.message || '').toString().trim();
}

function getRoomId(message) {
  return Number(message.targetChannelId || message.targetGroupId || message.groupId || message.channelId || message.recipientGroupId || message.group?.id || message.channel?.id || 0);
}

function cleanText(text) {
  return String(text || '').replace(/[\u200B-\u200F\uFEFF\u2060]/g, '').trim();
}

function isEnergyReadyMessage(text) {
  const body = cleanText(text).toLowerCase();
  return (
    body.includes('your animal is back to full energy') ||
    body.includes('animal is back to full energy') ||
    body.includes('عاد حيوانك لطاقته الكاملة') ||
    body.includes('عاد حيوانك إلى طاقته الكاملة') ||
    body.includes('طاقته الكاملة') ||
    body.includes('full energy')
  );
}

function extractLastIdFromRaceMessage(body) {
  const cleanBody = cleanText(body);
  const ids = [...cleanBody.matchAll(/\((\d+)\)/g)];
  if (ids.length === 0) return null;
  return ids[ids.length - 1][1];
}

// =========================================================================
// ================== 🛡️ طابور الإرسال ==================
// =========================================================================

class SafeQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  async add(client, channelId, command, accountName = 'UNKNOWN') {
    return new Promise((resolve) => {
      this.queue.push({ client, channelId, command, accountName, resolve });
      this.process();
    });
  }

  async process() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const { client, channelId, command, accountName, resolve } = this.queue.shift();
    let success = false;

    try {
      await client.messaging.sendChannelMessage(Number(channelId), command);
      console.log(`📤 [${accountName}] ${command}`);
      success = true;
      await sleep(2000); // حماية بين الإرسال
    } catch (err) {
      console.error(`❌ [${accountName}] خطأ إرسال: ${err.message}`);
    }

    this.isProcessing = false;
    resolve(success);
    this.process();
  }
}

const globalQueue = new SafeQueue();

// =========================================================================
// ================== 🚦 مدير السباق لحساب واحد ==================
// =========================================================================

class SingleBotManager {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.state = {
      energyReady: true,
      inRace: false,
      lastFinishedAt: 0
    };
    this.raceWatchdog = null;
    this.energyWaitTimer = null;
    this.hasStarted = false;
  }

  start() {
    if (this.hasStarted) return;
    this.hasStarted = true;
    console.log(`🚀 بدء نظام السباق للحساب: ${this.config.name}`);
    this.tryStartRace();
  }

  async tryStartRace() {
    if (this.state.inRace) return; // الحساب في سباق حالياً

    // فحص الطاقة
    if (!this.state.energyReady) {
      if (this.state.lastFinishedAt > 0) {
        const elapsed = Date.now() - this.state.lastFinishedAt;
        const remaining = ENERGY_FALLBACK_MS - elapsed;
        
        if (remaining <= 0) {
          this.state.energyReady = true;
        } else {
          console.log(`⏳ [طاقة] ننتظر طاقة ${this.config.name} (${Math.ceil(remaining / 1000)} ثانية)...`);
          this.scheduleEnergyFallback(remaining);
          return;
        }
      } else {
        console.log(`⏳ [طاقة] ننتظر رسالة اكتمال طاقة ${this.config.name}...`);
        return;
      }
    }

    // إغلاق الطاقة وبدء السباق
    this.state.energyReady = false;
    this.state.inRace = true;
    
    clearTimeout(this.energyWaitTimer);

    console.log(`🎯 [${this.config.name}] جاري الجلد...`);
    const sent = await globalQueue.add(
      this.client,
      this.config.sChannel,
      `!س جلد خاص ${this.config.id}`,
      this.config.name
    );

    if (!sent) {
      console.error(`❌ [${this.config.name}] فشل إرسال الأمر.`);
      this.state.inRace = false;
      this.state.energyReady = true;
      return;
    }

    this.startRaceWatchdog();
  }

  scheduleEnergyFallback(remainingMs) {
    clearTimeout(this.energyWaitTimer);
    this.energyWaitTimer = setTimeout(() => {
      if (this.state.inRace) return;
      this.state.energyReady = true;
      console.log(`✅ [طاقة احتياطية] تم اعتبار ${this.config.name} جاهزًا بعد مرور 11 دقيقة.`);
      this.tryStartRace();
    }, Math.max(0, remainingMs));
  }

  startRaceWatchdog() {
    clearTimeout(this.raceWatchdog);
    this.raceWatchdog = setTimeout(() => {
      if (this.state.inRace) {
        console.log(`⚠️ لم تصل رسالة انتهاء السباق لـ ${this.config.name} خلال دقيقتين. سيتم بدء مؤقت الطاقة.`);
        this.state.inRace = false;
        this.state.lastFinishedAt = Date.now();
        this.scheduleEnergyFallback(ENERGY_FALLBACK_MS);
      }
    }, RACE_END_TIMEOUT_MS);
  }

  handleEnergyReady() {
    if (this.state.energyReady) return;
    this.state.energyReady = true;
    console.log(`🔋 [${this.config.name}] رجعت طاقته وصار جاهز.`);
    
    if (!this.state.inRace) {
      this.tryStartRace();
    }
  }

  handleRaceEnd(body) {
    const extractedId = extractLastIdFromRaceMessage(body);
    if (!extractedId || String(extractedId) !== String(this.config.id)) return;

    console.log(`🏁 [السباق] أنهى ${this.config.name} السباق.`);
    this.state.inRace = false;
    this.state.lastFinishedAt = Date.now();
    clearTimeout(this.raceWatchdog);
    this.scheduleEnergyFallback(ENERGY_FALLBACK_MS);
  }
}

// =========================================================================
// ================== 🤖 تشغيل الحساب ==================
// =========================================================================

const client = new WOLF();
const manager = new SingleBotManager(client, ACCOUNT);

async function handleIncomingMessage(message) {
  try {
    const senderId = getSenderId(message);
    const roomId = getRoomId(message);
    let body = getMessageText(message);

    if (!body || senderId !== Number(TRACKED_BOT_ID)) return;
    
    body = cleanText(body);

    if (isEnergyReadyMessage(body)) {
      manager.handleEnergyReady();
      return;
    }

    if (roomId === Number(RACE_ROOM_ID) && body.includes('انتهى السباق')) {
      manager.handleRaceEnd(body);
    }
  } catch (err) {
    console.error(`❌ خطأ استقبال: ${err.message}`);
  }
}

client.on('message', handleIncomingMessage);
client.on('groupMessage', handleIncomingMessage);

client.on('ready', () => {
  console.log(`✅ ${ACCOUNT.name} متصل بنجاح.`);
  // تشغيل السكربت بعد 5 ثوانٍ من تسجيل الدخول
  setTimeout(() => manager.start(), 5000);
});

try {
  client.login(ACCOUNT.email, ACCOUNT.password).catch(err => {
    console.error(`❌ فشل تسجيل الدخول: ${err.message}`);
  });
} catch (err) {
  console.error(`❌ خطأ تسجيل الدخول: ${err.message}`);
}
