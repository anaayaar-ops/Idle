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
const RACE_ROOM_ID = 18654218;

// إذا بدأ الحساب ولم تصل رسالة انتهاء السباق خلال دقيقتين
const RACE_END_TIMEOUT_MS = 120 * 1000;

// إذا لم تصل رسالة اكتمال الطاقة، يعتبر الحساب جاهزًا بعد 11 دقيقة
const ENERGY_FALLBACK_MS = 11 * 60 * 1000;

const ACCOUNTS = [
  {
    email: process.env.U_MAIL_1,
    password: process.env.U_PASS_1,
    name: 'King',
    id: 38770375,
    index: 1,
    sChannel: 18654218
  },
  {
    email: process.env.U_MAIL_2,
    password: process.env.U_PASS_2,
    name: 'KSA',
    id: 27112980,
    index: 2,
    sChannel: 18654218
  },
  {
    email: process.env.U_MAIL_3,
    password: process.env.U_PASS_3,
    name: 'MKH',
    id: 1780249,
    index: 3,
    sChannel: 18654218
  },
  {
    email: process.env.U_MAIL_4,
    password: process.env.U_PASS_4,
    name: 'SAA',
    id: 2251312,
    index: 4,
    sChannel: 18654218
  },
  {
    email: process.env.U_MAIL_5,
    password: process.env.U_PASS_5,
    name: 'JDH',
    id: 39043364,
    index: 5,
    sChannel: 18654218
  },
  {
    email: process.env.U_MAIL_6,
    password: process.env.U_PASS_6,
    name: 'MLK',
    id: 34648535,
    index: 6,
    sChannel: 18654218
  },
  {
    email: process.env.U_MAIL_7,
    password: process.env.U_PASS_7,
    name: 'CRN',
    id: 79996355,
    index: 7,
    sChannel: 18654218
  },
  {
    email: process.env.U_MAIL_8,
    password: process.env.U_PASS_8,
    name: 'REX',
    id: 34435550,
    index: 8,
    sChannel: 18654218
  },
  {
    email: process.env.U_MAIL_9,
    password: process.env.U_PASS_9,
    name: 'LRD',
    id: 15859439,
    index: 9,
    sChannel: 18654218
  },
  {
    email: process.env.U_MAIL_10,
    password: process.env.U_PASS_10,
    name: 'ROY',
    id: 32198971,
    index: 10,
    sChannel: 18654218
  },
  {
    email: process.env.U_MAIL_11,
    password: process.env.U_PASS_11,
    name: 'EMP',
    id: 39515341,
    index: 11,
    sChannel: 18654218
  },
  {
    email: process.env.U_MAIL_12,
    password: process.env.U_PASS_12,
    name: 'NOR',
    id: 2374823,
    index: 12,
    sChannel: 18654218
  }
];

const ACTIVE_ACCOUNTS = [1,  3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function isAccountActive(index) {
  return ACTIVE_ACCOUNTS.includes(Number(index));
}

function getFirstActiveIndex() {
  const sorted = [...ACTIVE_ACCOUNTS].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[0] : null;
}

function getNextActiveIndex(currentIndex) {
  const sorted = [...ACTIVE_ACCOUNTS].sort((a, b) => a - b);

  if (sorted.length === 0) return null;

  const next = sorted.find(index => index > currentIndex);

  return next ?? sorted[0];
}

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
  return String(text || '')
    .replace(/[\u200B-\u200F\uFEFF\u2060]/g, '')
    .trim();
}

// ================== التعرف على رسالة اكتمال الطاقة ==================

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

// ================== استخراج آخر ID من نتيجة السباق ==================

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
      this.queue.push({
        client,
        channelId,
        command,
        accountName,
        resolve
      });

      this.process();
    });
  }

  async process() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    const {
      client,
      channelId,
      command,
      accountName,
      resolve
    } = this.queue.shift();

    let success = false;

    try {
      await client.messaging.sendChannelMessage(
        Number(channelId),
        command
      );

      console.log(`📤 [${accountName}] ${command}`);

      success = true;

      // حماية بسيطة بين عمليات الإرسال
      await sleep(2000);

    } catch (err) {
      console.error(
        `❌ [${accountName}] خطأ إرسال: ${err.message}`
      );
    }

    this.isProcessing = false;

    resolve(success);

    this.process();
  }
}

const globalQueue = new SafeQueue();

// =========================================================================
// ================== 🚦 مدير السباق والطاقة ==================
// =========================================================================

class RaceManager {
  constructor() {
    // رقم الحساب الذي عليه الدور
    this.currentTurnIndex = 1;

    // الحسابات المتصلة
    this.clientsMap = new Map();

    // حالة كل حساب
    this.accountStates = new Map();

    // قفل يمنع تشغيل حسابين بنفس الوقت
    this.isRaceRunning = false;

    // رقم الحساب الموجود في السباق حاليًا
    this.activeRaceIndex = null;

    // منع تكرار معالجة نتيجة السباق
    this.lastRaceId = null;
    this.lastRaceTime = 0;

    // يمنع تشغيل النظام أكثر من مرة
    this.hasStarted = false;

    // مؤقت عدم وصول رسالة انتهاء السباق
    this.raceWatchdog = null;

    // مؤقت انتظار استرجاع الطاقة
    this.energyWaitTimer = null;
    this.energyWaitIndex = null;
  }

  // ================== تسجيل الحساب ==================

  registerClient(index, config, client, triggerFunc) {
    this.clientsMap.set(index, {
      config,
      client,
      triggerFunc
    });

    if (!this.accountStates.has(index)) {
      this.accountStates.set(index, {
        energyReady: true,
        inRace: false,
        lastStartedAt: 0,
        lastFinishedAt: 0
      });
    }

    console.log(`🧩 تم تسجيل الحساب ${config.name} في المدير.`);

    // إذا كان النظام ينتظر هذا الحساب حتى يتصل
    if (
      this.hasStarted &&
      !this.isRaceRunning &&
      this.currentTurnIndex === index
    ) {
      this.tryStartCurrentTurn();
    }
  }

  // ================== جلب حالة الحساب ==================

  getState(index) {
    if (!this.accountStates.has(index)) {
      this.accountStates.set(index, {
        energyReady: true,
        inRace: false,
        lastStartedAt: 0,
        lastFinishedAt: 0
      });
    }

    return this.accountStates.get(index);
  }

  // ================== بدء النظام ==================

 start() {
  if (this.hasStarted) return;

  const firstActiveIndex = getFirstActiveIndex();

  if (firstActiveIndex === null) {
    console.log('❌ لا يوجد أي حساب مفعّل.');
    return;
  }

  this.hasStarted = true;
  this.currentTurnIndex = firstActiveIndex;

  console.log(`🚀 بدء نظام السباق من الحساب رقم ${firstActiveIndex}.`);

  this.tryStartCurrentTurn();
}

  // ================== تنظيف مؤقت انتهاء السباق ==================

  clearRaceWatchdog() {
    if (this.raceWatchdog) {
      clearTimeout(this.raceWatchdog);
      this.raceWatchdog = null;
    }
  }

  // ================== تشغيل مؤقت انتهاء السباق ==================

  startRaceWatchdog(index) {
    this.clearRaceWatchdog();

    this.raceWatchdog = setTimeout(() => {
      if (
        this.isRaceRunning &&
        this.activeRaceIndex === index
      ) {
        const bot = this.clientsMap.get(index);
        const state = this.getState(index);

        console.log(
          `⚠️ لم تصل رسالة انتهاء السباق لـ ${
            bot?.config?.name || index
          } خلال ${RACE_END_TIMEOUT_MS / 1000} ثانية، سيتم الانتقال للحساب التالي.`
        );

        state.inRace = false;
        state.energyReady = false;

        // نبدأ احتساب الطاقة احتياطيًا من وقت التجاوز
        state.lastFinishedAt = Date.now();

        this.isRaceRunning = false;
        this.activeRaceIndex = null;

      const nextActiveIndex = getNextActiveIndex(index);

if (nextActiveIndex === null) {
  console.log('❌ لا يوجد حساب مفعّل للانتقال إليه.');
  return;
}

this.currentTurnIndex = nextActiveIndex;

        this.tryStartCurrentTurn();
      }
    }, RACE_END_TIMEOUT_MS);
  }

  // ================== تنظيف مؤقت الطاقة ==================

  clearEnergyWaitTimer() {
    if (this.energyWaitTimer) {
      clearTimeout(this.energyWaitTimer);
      this.energyWaitTimer = null;
    }

    this.energyWaitIndex = null;
  }

  // ================== جدولة الاحتياط الخاص بالطاقة ==================

  scheduleEnergyFallback(index, remainingMs) {
    this.clearEnergyWaitTimer();

    this.energyWaitIndex = index;

    this.energyWaitTimer = setTimeout(() => {
      if (
        this.isRaceRunning ||
        this.currentTurnIndex !== index ||
        this.energyWaitIndex !== index
      ) {
        return;
      }

      const bot = this.clientsMap.get(index);
      const state = this.getState(index);

      state.energyReady = true;

      this.energyWaitTimer = null;
      this.energyWaitIndex = null;

      console.log(
        `✅ [طاقة احتياطية] تم اعتبار ${
          bot?.config?.name || index
        } جاهزًا بعد مرور 11 دقيقة.`
      );

      this.tryStartCurrentTurn();

    }, Math.max(0, remainingMs));
  }

  // ================== محاولة تشغيل الحساب صاحب الدور ==================

  async tryStartCurrentTurn() {
    // لا يمكن تشغيل حساب جديد أثناء وجود سباق
    if (this.isRaceRunning) return;

  
   const turnIndex = this.currentTurnIndex;
const currentBot = this.clientsMap.get(turnIndex);

if (!currentBot) {

    const nextActive = getNextActiveIndex(turnIndex);

    if (nextActive === null) {
        console.log('❌ لا يوجد أي حساب مفعّل.');
        return;
    }

    console.log(`⏭️ تجاوز الحساب ${turnIndex} لأنه غير متصل.`);

    this.currentTurnIndex = nextActive;

    return this.tryStartCurrentTurn();
}

    const state = this.getState(turnIndex);

    // ================== فحص الطاقة ==================

    if (!state.energyReady) {
      if (state.lastFinishedAt > 0) {
        const elapsed =
          Date.now() - state.lastFinishedAt;

        const remaining =
          ENERGY_FALLBACK_MS - elapsed;

        if (remaining <= 0) {
          state.energyReady = true;

          console.log(
            `✅ [طاقة احتياطية] ${currentBot.config.name} جاهز لأن 11 دقيقة مرت منذ نهاية سباقه.`
          );

        } else {
          console.log(
            `⏳ [طاقة] ${currentBot.config.name} لم ترجع طاقته بعد، ننتظر رسالة الطاقة أو ${Math.ceil(remaining / 1000)} ثانية.`
          );

          this.scheduleEnergyFallback(
            turnIndex,
            remaining
          );

          return;
        }

      } else {
        console.log(
          `⏳ [طاقة] ${currentBot.config.name} لم ترجع طاقته بعد، ننتظر رسالة اكتمال الطاقة.`
        );

        return;
      }
    }

    if (state.inRace) {
      console.log(
        `⏳ [سباق] ${currentBot.config.name} داخل سباق حاليًا.`
      );

      return;
    }

    // انتهى انتظار طاقة الحساب الحالي
    this.clearEnergyWaitTimer();

    // إغلاق الطاقة فور تشغيل الحساب
    state.energyReady = false;
    state.inRace = true;
    state.lastStartedAt = Date.now();

    // تفعيل القفل العام
    this.isRaceRunning = true;
    this.activeRaceIndex = turnIndex;

    console.log(
      `🎯 [${currentBot.config.name}] حان دوري، جاري الجلد...`
    );

    const sent = await currentBot.triggerFunc();

    // إذا فشل الإرسال، نفك القفل حتى لا يتوقف النظام
    if (!sent) {
      console.error(
        `❌ [${currentBot.config.name}] لم يتم إرسال أمر السباق بنجاح.`
      );

      state.inRace = false;
      state.energyReady = true;

      this.isRaceRunning = false;
      this.activeRaceIndex = null;

      return;
    }

    // تشغيل حماية انتظار نتيجة السباق
    this.startRaceWatchdog(turnIndex);
  }

  // ================== استقبال اكتمال الطاقة ==================

  handleEnergyReady(accountIndex) {
    const bot = this.clientsMap.get(accountIndex);
    const state = this.getState(accountIndex);

    // إذا كانت الطاقة مسجلة جاهزة مسبقًا، لا نكرر اللوق
    if (state.energyReady) return;

    state.energyReady = true;

    console.log(
      `🔋 [${bot?.config?.name || accountIndex}] رجعت طاقته وصار جاهز.`
    );

    // إذا الرسالة تخص الحساب صاحب الدور
    if (
      !this.isRaceRunning &&
      accountIndex === this.currentTurnIndex
    ) {
      this.clearEnergyWaitTimer();
      this.tryStartCurrentTurn();
    }
  }

  // ================== استقبال انتهاء السباق ==================

  async handleRaceEndMessage(body) {
    body = cleanText(body);

    if (!body.includes('انتهى السباق')) return;

    const extractedId =
      extractLastIdFromRaceMessage(body);

    if (!extractedId) return;

    const now = Date.now();

    // منع نفس النتيجة من المعالجة أكثر من مرة
    if (
      this.lastRaceId === extractedId &&
      now - this.lastRaceTime < 5000
    ) {
      return;
    }

    const finishedBot =
      [...this.clientsMap.values()].find(
        bot =>
          String(bot.config.id) ===
          String(extractedId)
      );

    if (!finishedBot) return;

    const finishedIndex =
      finishedBot.config.index;

    // لا نعتمد نتيجة تخص حسابًا غير الحساب النشط
    if (this.activeRaceIndex !== finishedIndex) {
      return;
    }

    // نسجل منع التكرار بعد التأكد من أن النتيجة صحيحة
    this.lastRaceId = extractedId;
    this.lastRaceTime = now;

    const finishedState =
      this.getState(finishedIndex);

    finishedState.inRace = false;
    finishedState.energyReady = false;

    // بداية احتساب 11 دقيقة من لحظة انتهاء السباق
    finishedState.lastFinishedAt = Date.now();

    console.log(
      `🏁 [السباق] الحساب ${finishedBot.config.name} أنهى السباق.`
    );

    this.clearRaceWatchdog();

    this.isRaceRunning = false;
    this.activeRaceIndex = null;

    // الانتقال للحساب التالي بالترتيب
    const nextActiveIndex = getNextActiveIndex(finishedIndex);

if (nextActiveIndex === null) {
  console.log('❌ لا يوجد حساب مفعّل للانتقال إليه.');
  return;
}

this.currentTurnIndex = nextActiveIndex;

    this.tryStartCurrentTurn();
  }
}

const raceManager = new RaceManager();

// =========================================================================
// ================== 🤖 تشغيل الحسابات ==================
// =========================================================================

function createBot(config) {
  const client = new WOLF();

  // ================== إرسال أمر السباق ==================

  async function triggerRaceCommand() {
    return await globalQueue.add(
      client,
      config.sChannel,
      `!س جلد خاص ${config.id}`,
      config.name
    );
  }

  // ================== استقبال الرسائل ==================

  async function handleIncomingMessage(message) {
    try {
      const senderId = getSenderId(message);
      const roomId = getRoomId(message);

      let body = getMessageText(message);

      if (!body) return;

      // لا يستقبل إلا من بوت السباق
      if (
        senderId !== Number(TRACKED_BOT_ID)
      ) {
        return;
      }

      body = cleanText(body);

      // رسالة الطاقة الخاصة بكل حساب
      if (isEnergyReadyMessage(body)) {
        raceManager.handleEnergyReady(
          config.index
        );

        return;
      }

      // رسالة انتهاء السباق الموجودة في الروم
      if (
        roomId === Number(RACE_ROOM_ID) &&
        body.includes('انتهى السباق')
      ) {
        await raceManager.handleRaceEndMessage(
          body
        );
      }

    } catch (err) {
      console.error(
        `❌ [${config.name}] خطأ استقبال: ${err.message}`
      );
    }
  }

  // نستقبل من الحدثين لأن بعض الرسائل قد تصل بأحدهما فقط
  client.on(
    'message',
    handleIncomingMessage
  );

  client.on(
    'groupMessage',
    handleIncomingMessage
  );

  // ================== جاهزية الحساب ==================

  client.on('ready', () => {
    console.log(`✅ ${config.name} متصل.`);

    raceManager.registerClient(
      config.index,
      config,
      client,
      triggerRaceCommand
    );

    // بدء الدورة من الحساب الأول
if (config.index === getFirstActiveIndex()) {
  setTimeout(
    () => raceManager.start(),
    5000
  );
}
  });

  // ================== تسجيل الدخول ==================

  try {
    const loginResult = client.login(
      config.email,
      config.password
    );

    if (
      loginResult &&
      typeof loginResult.catch === 'function'
    ) {
      loginResult.catch((err) => {
        console.error(
          `❌ [${config.name}] فشل تسجيل الدخول: ${err.message}`
        );
      });
    }

  } catch (err) {
    console.error(
      `❌ [${config.name}] خطأ تسجيل الدخول: ${err.message}`
    );
  }
}

// =========================================================================
// ================== تشغيل الحسابات بفاصل 4 ثوانٍ ==================
// =========================================================================

let loginOrder = 0;

ACCOUNTS.forEach((account) => {
  if (!isAccountActive(account.index)) {
    console.log(`⏸️ الحساب ${account.name} متوقف.`);
    return;
  }

  setTimeout(
    () => createBot(account),
    loginOrder * 4000
  );

  loginOrder++;
});
