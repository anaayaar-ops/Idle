import 'dotenv/config';

process.env.SUPPRESS_NO_CONFIG_WARNING = 'true';

// ================== تنظيف الكونسول ==================

const originalLog = console.log.bind(console);
const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);

const HIDE_LOGS = [
  '[DEBUG]',
  '[WARN]',
  'DEBUG',
  'WARN',
  'CleanUp',
  'Synchronise',
  'GroupAudioCountUpdated',
  'MessageUpdate',
  'Websocket',
  'TipAdd',
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

// ================== استيراد wolf.js ==================

const wolfjs = await import('wolf.js');
const { WOLF } = wolfjs.default || wolfjs;

// =========================================================================
// ================== 🎮 إعدادات الحسابات ==================
// =========================================================================

const TRACKED_BOT_ID = 80277459;
const RACE_ROOM_ID = 569;

// إذا بدأ حساب وما وصلت رسالة انتهاء السباق خلال هذا الوقت، يتجاوزه
const RACE_END_TIMEOUT_MS = 120 * 1000;

const ACCOUNTS = [
  { email: process.env.U_MAIL_1,  password: process.env.U_PASS_1,  name: 'King', id: 38770375, index: 1,  sChannel: 569 },
  { email: process.env.U_MAIL_2,  password: process.env.U_PASS_2,  name: 'KSA',  id: 27112980, index: 2,  sChannel: 569 },
  { email: process.env.U_MAIL_3,  password: process.env.U_PASS_3,  name: 'MKH',  id: 1780249,  index: 3,  sChannel: 569 },
  { email: process.env.U_MAIL_4,  password: process.env.U_PASS_4,  name: 'SAA',  id: 2251312,  index: 4,  sChannel: 569 },
  { email: process.env.U_MAIL_5,  password: process.env.U_PASS_5,  name: 'JDH',  id: 39043364, index: 5,  sChannel: 569 },
  { email: process.env.U_MAIL_6,  password: process.env.U_PASS_6,  name: 'MLK',  id: 34648535, index: 6,  sChannel: 569 },
  { email: process.env.U_MAIL_7,  password: process.env.U_PASS_7,  name: 'CRN',  id: 79996355, index: 7,  sChannel: 569 },
  { email: process.env.U_MAIL_8,  password: process.env.U_PASS_8,  name: 'REX',  id: 34435550, index: 8,  sChannel: 569 },
  { email: process.env.U_MAIL_9,  password: process.env.U_PASS_9,  name: 'LRD',  id: 15859439, index: 9,  sChannel: 569 },
  { email: process.env.U_MAIL_10, password: process.env.U_PASS_10, name: 'ROY',  id: 32198971, index: 10, sChannel: 569 },
  { email: process.env.U_MAIL_11, password: process.env.U_PASS_11, name: 'EMP',  id: 39515341, index: 11, sChannel: 569 },
  { email: process.env.U_MAIL_12, password: process.env.U_PASS_12, name: 'NOR',  id: 2374823,  index: 12, sChannel: 569 }
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// =========================================================================
// ================== أدوات قراءة الرسائل ==================
// =========================================================================

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

function getRoomId(message) {
  return Number(
    message.targetChannelId ||
    message.targetGroupId ||
    message.groupId ||
    message.channelId ||
    message.recipientGroupId ||
    message.group?.id ||
    message.channel?.id ||
    0
  );
}

function cleanText(text) {
  return String(text || '').replace(/[\u200B-\u200F\uFEFF\u2060]/g, '').trim();
}

function isEnergyReadyMessage(text) {
  const body = cleanText(text).toLowerCase();

  return (
    body.includes('your animal is back to full energy') ||
    body.includes('عاد حيوانك لطاقته الكاملة') ||
    body.includes('طاقته الكاملة') ||
    body.includes('full energy')
  );
}

function extractLastIdFromRaceMessage(body) {
  const cleanBody = cleanText(body);
  const ids = [...cleanBody.matchAll(/\((\d+)\)/g)];

  if (!ids.length) return null;

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

    try {
      await client.messaging.sendChannelMessage(Number(channelId), command);
      console.log(`📤 [${accountName}] ${command}`);
      await sleep(2000);
    } catch (err) {
      console.error(`❌ [${accountName}] خطأ إرسال: ${err.message}`);
    }

    this.isProcessing = false;
    resolve();
    this.process();
  }
}

const globalQueue = new SafeQueue();

// =========================================================================
// ================== 🚦 مدير السباق والطاقة ==================
// =========================================================================

class RaceManager {
  constructor() {
    this.currentTurnIndex = 1;
    this.clientsMap = new Map();
    this.accountStates = new Map();

    this.isRaceRunning = false;
    this.activeRaceIndex = null;

    this.lastRaceId = null;
    this.lastRaceTime = 0;

    this.hasStarted = false;

    this.raceWatchdog = null;
  }

  registerClient(index, config, client, triggerFunc) {
    this.clientsMap.set(index, { config, client, triggerFunc });

    if (!this.accountStates.has(index)) {
      this.accountStates.set(index, {
        energyReady: true,
        inRace: false
      });
    }

    console.log(`🧩 تم تسجيل الحساب ${config.name} في المدير.`);

    if (this.hasStarted && !this.isRaceRunning && this.currentTurnIndex === index) {
      this.tryStartCurrentTurn();
    }
  }

  getState(index) {
    if (!this.accountStates.has(index)) {
      this.accountStates.set(index, {
        energyReady: true,
        inRace: false
      });
    }

    return this.accountStates.get(index);
  }

  start() {
    if (this.hasStarted) return;

    this.hasStarted = true;
    this.currentTurnIndex = 1;

    console.log('🚀 بدء نظام السباق من الحساب الأول.');
    this.tryStartCurrentTurn();
  }

  startRaceWatchdog(index) {
    this.clearRaceWatchdog();

    this.raceWatchdog = setTimeout(() => {
      if (this.isRaceRunning && this.activeRaceIndex === index) {
        const bot = this.clientsMap.get(index);
        const state = this.getState(index);

        console.log(`⚠️ لم تصل رسالة انتهاء السباق لـ ${bot?.config?.name || index} خلال ${RACE_END_TIMEOUT_MS / 1000} ثانية، سيتم تجاوزه.`);

        state.inRace = false;

        this.isRaceRunning = false;
        this.activeRaceIndex = null;

        this.currentTurnIndex =
          index >= ACCOUNTS.length ? 1 : index + 1;

        this.tryStartCurrentTurn();
      }
    }, RACE_END_TIMEOUT_MS);
  }

  clearRaceWatchdog() {
    if (this.raceWatchdog) {
      clearTimeout(this.raceWatchdog);
      this.raceWatchdog = null;
    }
  }

  async tryStartCurrentTurn() {
    if (this.isRaceRunning) return;

    const currentBot = this.clientsMap.get(this.currentTurnIndex);

    if (!currentBot) {
      console.log(`⚠️ الحساب رقم ${this.currentTurnIndex} غير متصل، سيتم انتظار اتصاله.`);
      return;
    }

    const state = this.getState(this.currentTurnIndex);

    if (!state.energyReady) {
      console.log(`⏳ [طاقة] ${currentBot.config.name} لم ترجع طاقته بعد، ننتظر رسالة اكتمال الطاقة.`);
      return;
    }

    if (state.inRace) {
      console.log(`⏳ [سباق] ${currentBot.config.name} داخل سباق حاليًا.`);
      return;
    }

    state.energyReady = false;
    state.inRace = true;

    this.isRaceRunning = true;
    this.activeRaceIndex = this.currentTurnIndex;

    console.log(`🎯 [${currentBot.config.name}] حان دوري، جاري الجلد...`);

    await currentBot.triggerFunc();

    this.startRaceWatchdog(this.currentTurnIndex);
  }

  handleEnergyReady(accountIndex) {
    const bot = this.clientsMap.get(accountIndex);
    const state = this.getState(accountIndex);

    state.energyReady = true;

    console.log(`🔋 [${bot?.config?.name || accountIndex}] رجعت طاقته وصار جاهز.`);

    if (!this.isRaceRunning && accountIndex === this.currentTurnIndex) {
      this.tryStartCurrentTurn();
    }
  }

  async handleRaceEndMessage(body) {
    body = cleanText(body);

    if (!body.includes('انتهى السباق')) return;

    const extractedId = extractLastIdFromRaceMessage(body);
    if (!extractedId) return;

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
      .find(bot => String(bot.config.id) === String(extractedId));

    if (!finishedBot) {
      console.log(`⚠️ لم يتم العثور على الحساب صاحب الـ ID: ${extractedId}`);
      return;
    }

    const finishedIndex = finishedBot.config.index;
    const finishedState = this.getState(finishedIndex);

    finishedState.inRace = false;

    if (this.activeRaceIndex !== finishedIndex) {
      console.log(`⚠️ وصلت نهاية سباق لـ ${finishedBot.config.name} لكنه ليس الحساب النشط حاليًا، تم تجاهلها.`);
      return;
    }

    console.log(`🏁 [السباق] الحساب ${finishedBot.config.name} أنهى السباق.`);

    this.clearRaceWatchdog();

    this.isRaceRunning = false;
    this.activeRaceIndex = null;

    this.currentTurnIndex =
      finishedIndex >= ACCOUNTS.length
        ? 1
        : finishedIndex + 1;

    this.tryStartCurrentTurn();
  }
}

const raceManager = new RaceManager();

// =========================================================================
// ================== 🤖 تشغيل الحسابات ==================
// =========================================================================

function createBot(config) {
  const client = new WOLF();

  async function triggerRaceCommand() {
    await globalQueue.add(
      client,
      config.sChannel,
      `!س جلد خاص ${config.id}`,
      config.name
    );
  }

  async function handleIncomingMessage(message) {
    try {
      const senderId = getSenderId(message);
      const roomId = getRoomId(message);
      let body = getMessageText(message);

      if (!body) return;
      if (senderId !== Number(TRACKED_BOT_ID)) return;

      body = cleanText(body);

      // رسائل الطاقة تكون في الخاص لكل حساب
      if (isEnergyReadyMessage(body)) {
        raceManager.handleEnergyReady(config.index);
        return;
      }

      // رسائل انتهاء السباق تكون في الروم
      // كل الحسابات تقدر تلتقط الرسالة، والمدير يمنع التكرار
      if (roomId === Number(RACE_ROOM_ID) && body.includes('انتهى السباق')) {
        await raceManager.handleRaceEndMessage(body);
      }

    } catch (err) {
      console.error(`❌ [${config.name}] خطأ استقبال: ${err.message}`);
    }
  }

  client.on('message', handleIncomingMessage);
  client.on('groupMessage', handleIncomingMessage);

  client.on('ready', () => {
    console.log(`✅ ${config.name} متصل.`);

    raceManager.registerClient(
      config.index,
      config,
      client,
      triggerRaceCommand
    );

    if (config.index === 1) {
      setTimeout(() => raceManager.start(), 5000);
    }
  });

  try {
    const loginResult = client.login(config.email, config.password);

    if (loginResult && typeof loginResult.catch === 'function') {
      loginResult.catch((err) => {
        console.error(`❌ [${config.name}] فشل تسجيل الدخول: ${err.message}`);
      });
    }
  } catch (err) {
    console.error(`❌ [${config.name}] خطأ تسجيل الدخول: ${err.message}`);
  }
}

// =========================================================================
// ================== تشغيل الحسابات بفاصل ==================
// =========================================================================

ACCOUNTS.forEach((acc, i) => {
  setTimeout(() => createBot(acc), i * 4000);
});
