import 'dotenv/config';

process.env.SUPPRESS_NO_CONFIG_WARNING = 'true';

// ================== تنظيف الكونسول ==================

const originalLog = console.log.bind(console);
const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);

const HIDE_LOGS = [
  '[DEBUG]', '[WARN]', 'DEBUG', 'WARN',
  'CleanUp', 'Synchronise', 'GroupAudioCountUpdated',
  'MessageUpdate', 'Websocket', 'TipAdd',
  'Message from self ignoring',
  'Store Reset',
  'apiKey will be required',
  'APIKey will be required',
  'No configurations found',
  'SUPPRESS_NO_CONFIG_WARNING',
  'Logged in [profile:',
  'channel that was not cached',
  'privateMessageSubscription',
  'channelMessageSubscription',
  'tipChannelSubscription'
];

function shouldHide(text) {
  return HIDE_LOGS.some(word => text.includes(word));
}

console.log = (...args) => {
  const text = args.map(String).join(' ');
  if (shouldHide(text)) return;
  originalLog(...args);
};

console.info = console.log;
console.debug = console.log;

console.warn = (...args) => {
  const text = args.map(String).join(' ');
  if (shouldHide(text)) return;
  originalWarn(...args);
};

console.error = (...args) => {
  const text = args.map(String).join(' ');
  if (shouldHide(text)) return;
  originalError(...args);
};

const stdoutWrite = process.stdout.write.bind(process.stdout);
const stderrWrite = process.stderr.write.bind(process.stderr);

process.stdout.write = (chunk, encoding, callback) => {
  const text = String(chunk);
  if (shouldHide(text)) return true;
  return stdoutWrite(chunk, encoding, callback);
};

process.stderr.write = (chunk, encoding, callback) => {
  const text = String(chunk);
  if (shouldHide(text)) return true;
  return stderrWrite(chunk, encoding, callback);
};

// ================== استيراد wolf.js بالطريقة الأفضل ==================

const wolfjs = await import('wolf.js');
const { WOLF } = wolfjs.default || wolfjs;
// =========================================================================
// ================== 🎮 إعدادات الحسابات ==================
// =========================================================================

const TRACKED_BOT_ID = 80277459; // آيدي البوت الذي يرسل رسالة "انتهى السباق"

const ACCOUNTS = [
    { email: process.env.U_MAIL_1, password: process.env.U_PASS_1, name: 'King', id: 38770375, index: 1, sChannel: 569 },
    { email: process.env.U_MAIL_2, password: process.env.U_PASS_2, name: 'KSA', id: 27112980, index: 2, sChannel: 569 },
    { email: process.env.U_MAIL_3, password: process.env.U_PASS_3, name: 'MKH', id: 1780249, index: 3, sChannel: 569 },
    { email: process.env.U_MAIL_4, password: process.env.U_PASS_4, name: 'SAA', id: 2251312, index: 4, sChannel: 569 },
    { email: process.env.U_MAIL_5, password: process.env.U_PASS_5, name: 'JDH', id: 39043364, index: 5, sChannel: 569 },
    { email: process.env.U_MAIL_6, password: process.env.U_PASS_6, name: 'MLK', id: 34648535, index: 6, sChannel: 569 },
    { email: process.env.U_MAIL_7, password: process.env.U_PASS_7, name: 'CRN', id: 79996355, index: 7, sChannel: 569 },
    { email: process.env.U_MAIL_8, password: process.env.U_PASS_8, name: 'REX', id: 34435550, index: 8, sChannel: 569 },
    { email: process.env.U_MAIL_9, password: process.env.U_PASS_9, name: 'LRD', id: 15859439, index: 9, sChannel: 569 },
    { email: process.env.U_MAIL_10, password: process.env.U_PASS_10, name: 'ROY', id: 32198971, index: 10, sChannel: 569 },
    { email: process.env.U_MAIL_11, password: process.env.U_PASS_11, name: 'EMP', id: 39515341, index: 11, sChannel: 569 },
    { email: process.env.U_MAIL_12, password: process.env.U_PASS_12, name: 'NOR', id: 2374823, index: 12, sChannel: 569 }
];

// =========================================================================
// ================== 🛡️ طابور الأمان (لمنع السبام) ==================
// =========================================================================
class SafeQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
    }
    async add(client, channelId, command) {
        return new Promise((resolve) => {
            this.queue.push({ client, channelId, command, resolve });
            this.process();
        });
    }
    async process() {
        if (this.isProcessing || this.queue.length === 0) return;
        this.isProcessing = true;
        const { client, channelId, command, resolve } = this.queue.shift();
        try {
            await client.messaging.sendChannelMessage(Number(channelId), command);
            await new Promise(r => setTimeout(r, 2000)); // تأخير 2 ثانية للحماية
        } catch (err) { console.error(`❌ خطأ إرسال:`, err.message); }
        this.isProcessing = false;
        resolve();
        this.process();
    }
}
const globalQueue = new SafeQueue();

// =========================================================================
// ================== 🚦 مدير السباق والطاقة (12 دقيقة) ==================
// =========================================================================
class RaceManager {
    constructor() {
    this.currentTurnIndex = 1;
    this.lastTurnTime = {};
    this.clientsMap = new Map();

    this.lastProcessedRaceKey = '';
    this.lastProcessedRaceTime = 0;
}
    registerClient(index, config, client, triggerFunc) {
        this.clientsMap.set(index, { config, client, triggerFunc });
    }
   async handleRaceEndMessage(body) {
    body = String(body || '').replace(/[\u200B-\u200F\uFEFF\u2060]/g, '');

    if (!body.includes("انتهى السباق")) return;

    const ids = [...body.matchAll(/\((\d+)\)/g)];
    if (!ids.length) return;

    const extractedId = ids[ids.length - 1][1];
       // منع معالجة نفس الرسالة أكثر من مرة
const now = Date.now();

if (
    this.lastRaceId === extractedId &&
    now - this.lastRaceTime < 3000
) {
    return;
}

this.lastRaceId = extractedId;
this.lastRaceTime = now;

  const finishedBot = [...this.clientsMap.values()]
    .find(bot => String(bot.config.id) === extractedId);

if (!finishedBot) {
    console.log(`⚠️ لم يتم العثور على الحساب صاحب الـ ID: ${extractedId}`);
    return;
}

console.log(`🏁 [السباق] الحساب ${finishedBot.config.name} أنهى السباق.`);

this.currentTurnIndex =
    finishedBot.config.index >= ACCOUNTS.length
        ? 1
        : finishedBot.config.index + 1;

this.triggerNext();
       }
    async triggerNext() {
        const nextBot = this.clientsMap.get(this.currentTurnIndex);
        if (!nextBot) return;

        const twelveMinutes = 12 * 60 * 1000;
        const lastPlayed = this.lastTurnTime[this.currentTurnIndex] || 0;
        const now = Date.now();
        const diff = now - lastPlayed;

        if (diff >= twelveMinutes) {
            // الطاقة مكتملة، نفذ الأمر فوراً
            this.lastTurnTime[this.currentTurnIndex] = Date.now();
            nextBot.triggerFunc();
        } else {
            // الطاقة لم تكتمل، انتظر الوقت المتبقي
            const waitTime = twelveMinutes - diff;
            console.log(`⏳ [طاقة] ${nextBot.config.name} ينتظر ${Math.ceil(waitTime/1000)} ثانية لإكتمال الطاقة.`);
            setTimeout(() => {
                this.lastTurnTime[this.currentTurnIndex] = Date.now();
                nextBot.triggerFunc();
            }, waitTime);
        }
    }
}
function getSenderId(message) {
  return Number(
    message.sourceSubscriberId ||
    message.sourceUserId ||
    message.sourceId ||
    message.senderId ||
    message.userId ||
    0
  );
}

function getMessageText(message) {
  return (
    message.body ||
    message.content ||
    message.text ||
    message.message ||
    ''
  ).toString().trim();
}
const raceManager = new RaceManager();

// =========================================================================
// ================== 🤖 تشغيل البوتات ==================
// =========================================================================
function createBot(config) {
    const client = new WOLF();

    async function triggerRaceCommand() {
        console.log(`🎯 [${config.name}] حان دوري، جاري الجلد...`);
        await globalQueue.add(client, config.sChannel, `!س جلد خاص ${config.id}`);
    }

   async function handleIncomingMessage(message) {
    try {
        const senderId = getSenderId(message);
        let body = getMessageText(message);

        if (!body) return;
        if (senderId !== Number(TRACKED_BOT_ID)) return;

        body = body.replace(/[\u200B-\u200F\uFEFF\u2060]/g, '');

        await raceManager.handleRaceEndMessage(body);

    } catch (err) {
        console.error(`❌ [${config.name}] خطأ استقبال: ${err.message}`);
    }
}

client.on('message', handleIncomingMessage);
client.on('messageUpdate', handleIncomingMessage);
client.on('groupMessage', handleIncomingMessage);

    client.on('ready', () => {
        console.log(`✅ ${config.name} متصل.`);
        raceManager.registerClient(config.index, config, client, triggerRaceCommand);
        
        // إطلاق الدورة الأولى بعد 5 ثوانٍ من استقرار الاتصال
        if (config.index === 1) setTimeout(() => raceManager.triggerNext(), 5000);
    });

    client.login(config.email, config.password);
}

// تشغيل الحسابات بفاصل 4 ثوانٍ
ACCOUNTS.forEach((acc, i) => {
    setTimeout(() => createBot(acc), i * 4000);
});
