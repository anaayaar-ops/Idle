import 'dotenv/config';
import wolfjs from 'wolf.js';

const { WOLF } = wolfjs;

const accounts = [
  { identity: process.env.U_MAIL_1, secret: process.env.U_PASS_1 },
  { identity: process.env.U_MAIL_2, secret: process.env.U_PASS_2 },
  { identity: process.env.U_MAIL_3, secret: process.env.U_PASS_3 },
  { identity: process.env.U_MAIL_4, secret: process.env.U_PASS_4 },
  { identity: process.env.U_MAIL_5, secret: process.env.U_PASS_5 },
  { identity: process.env.U_MAIL_6, secret: process.env.U_PASS_6 },
  { identity: process.env.U_MAIL_7, secret: process.env.U_PASS_7 },
  { identity: process.env.U_MAIL_8, secret: process.env.U_PASS_8 },
  { identity: process.env.U_MAIL_9, secret: process.env.U_PASS_9 },
  { identity: process.env.U_MAIL_10, secret: process.env.U_PASS_10 },
  { identity: process.env.U_MAIL_11, secret: process.env.U_PASS_11 },
  { identity: process.env.U_MAIL_12, secret: process.env.U_PASS_12 },
  { identity: process.env.U_MAIL_13, secret: process.env.U_PASS_13 },
  { identity: process.env.U_MAIL_14, secret: process.env.U_PASS_14 }
];

// ==================================================
// ⚙️ الإعدادات السهلة
// ==================================================

// [] = تشغيل جميع الحسابات
// [13] = تشغيل الحساب 13 فقط
// [13, 14] = تشغيل الحسابين 13 و14
const ACTIVE_ACCOUNTS = [];

// [] = استقبال المعزز من أي عضوية

const ALLOWED_BONUS_SENDERS = [];

// الكلمة / الأمر الذي يرسله داخل الغرفة
const SEND_COMMAND = "!اسرق 5";

// وقت الانتظار بين كل غرفة وغرفة
const DELAY = 12000;

// وقت التشغيل والراحة
const WORK_TIME = 54 * 60 * 1000;
const REST_TIME = 6 * 60 * 1000;

// ==================================================

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function extractRoomId(text = "") {
  const cleaned = text
    .replace(/[\u200B-\u200F\uFEFF]/g, '')
    .replace(/\s+/g, ' ');

  let match = cleaned.match(/\(ID\s*(\d+)\)/i);

  if (!match) {
    match = cleaned.match(/\((\d+)\)/);
  }

  if (!match) {
    match = cleaned.match(/\b(\d{3,})\b/);
  }

  return match ? Number(match[1]) : null;
}

function extractSenderId(text = "") {
  const cleaned = text
    .replace(/[\u200B-\u200F\uFEFF]/g, '')
    .replace(/\s+/g, ' ');

  const matches = [...cleaned.matchAll(/\(ID\s*(\d+)\)|\((\d+)\)/gi)];

  if (matches.length < 2) return null;

  const last = matches[matches.length - 1];
  return Number(last[1] || last[2]);
}

function isBonusMessage(content = "") {
  return (
    /Bonus-/i.test(content) ||
    content.includes("معزز") ||
    content.includes("معزز إضافي")
  );
}

accounts.forEach((acc, index) => {
  if (
    ACTIVE_ACCOUNTS.length > 0 &&
    !ACTIVE_ACCOUNTS.includes(index + 1)
  ) {
    return;
  }

  const service = new WOLF();

  let queue = [];
  let queueSet = new Set();
  let isProcessing = false;
  let isResting = false;

  function addToQueue(roomId) {
    if (!roomId) return;
    if (queueSet.has(roomId)) return;

    queueSet.add(roomId);
    queue.unshift(roomId);
  }

  async function processQueue() {
    if (isProcessing) return;
    isProcessing = true;

    while (queue.length > 0) {
      if (isResting) break;

      const roomId = queue.shift();
      queueSet.delete(roomId);

      try {
        if (service.groups?.join) {
          await service.groups.join(roomId);
        } else if (service.group?.join) {
          await service.group.join(roomId);
        } else if (service.joinGroup) {
          await service.joinGroup(roomId);
        }

        await service.messaging.sendGroupMessage(roomId, SEND_COMMAND);

        console.log(`🚀 [حساب ${index + 1}] دخل ${roomId} وأرسل: ${SEND_COMMAND}`);

      } catch (err) {
        console.log(`❌ [حساب ${index + 1}] خطأ:`, err.message);
      }

      await sleep(DELAY);
    }

    isProcessing = false;
  }

  service.on('message', async (message) => {
    if (message.isGroup) return;

    const content =
      message.body ||
      message.content ||
      message.text ||
      message.message ||
      "";

    if (!isBonusMessage(content)) return;

    const roomId = extractRoomId(content);
    if (!roomId) return;

    const bonusSenderId = extractSenderId(content);

    if (
      ALLOWED_BONUS_SENDERS.length > 0 &&
      !ALLOWED_BONUS_SENDERS.includes(bonusSenderId)
    ) {
      console.log(`⛔ [حساب ${index + 1}] تجاهل معزز من عضوية: ${bonusSenderId}`);
      return;
    }

    console.log(`📥 [حساب ${index + 1}] غرفة: ${roomId} | صاحب المعزز: ${bonusSenderId}`);

    addToQueue(roomId);

    if (!isResting) {
      processQueue();
    }
  });

  async function cycle() {
    while (true) {
      console.log(`🟢 [حساب ${index + 1}] تشغيل 54 دقيقة`);
      isResting = false;

      processQueue();

      await sleep(WORK_TIME);

      console.log(`🛑 [حساب ${index + 1}] راحة 6 دقائق`);
      isResting = true;

      await sleep(REST_TIME);
    }
  }

  service.on('ready', () => {
    console.log(`✅ الحساب ${index + 1} جاهز`);
    cycle();
  });

  service.login(acc.identity, acc.secret);
});
