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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// =====================
// 🔥 استخراج Room ID
// =====================
function extractRoomId(text = "") {
  const cleaned = text.replace(/[\u200B-\u200F\uFEFF]/g, '');
  const match = cleaned.match(/ID\s*(\d{5,})|\((\d{5,})\)/);
  const id = match?.[1] || match?.[2];
  return id ? parseInt(id, 10) : null;
}

// =====================
// 🤖    شيل السطر تبع اف ويرجع يشتغل كل الحسابات كل حساب مستقل
// =====================
accounts.forEach((acc, index) => {
if (index !== 10) return;
  
  const service = new WOLF();

  // 📦 طابور + منع تكرار لكل حساب
  let queue = [];
  let queueSet = new Set(); // لمنع التكرار
  let isProcessing = false;

  // ⏱️ نظام الراحة
  let isResting = false;

  const WORK_TIME = 54 * 60 * 1000;
  const REST_TIME = 6 * 60 * 1000;
  const DELAY = 12000;

  // =====================
  // 📥 إضافة للروم (بدون تكرار + أولوية جديدة)
  // =====================
  function addToQueue(roomId) {
    if (!roomId) return;

    // 🔴 منع التكرار
    if (queueSet.has(roomId)) return;

    queueSet.add(roomId);

    // 🔥 أولوية للرومات الجديدة (تدخل أول الطابور)
    queue.unshift(roomId);
  }

  // =====================
  // 🔁 تنفيذ الطابور
  // =====================
  async function processQueue() {
    if (isProcessing) return;
    isProcessing = true;

    while (queue.length > 0) {

      if (isResting) break;

      const roomId = queue.shift();
      queueSet.delete(roomId); // إزالة من قائمة التكرار

      try {
        if (service.groups?.join) {
          await service.groups.join(roomId);
        } else if (service.group?.join) {
          await service.group.join(roomId);
        } else if (service.joinGroup) {
          await service.joinGroup(roomId);
        }

        await service.messaging.sendGroupMessage(roomId, "!اسرق 5");

        console.log(`🚀 [${index + 1}] نفذ على ${roomId}`);

      } catch (err) {
        console.log(`❌ [${index + 1}] خطأ:`, err.message);
      }

      await sleep(DELAY);
    }

    isProcessing = false;
  }

  // =====================
  // 📩 استقبال الرسائل
  // =====================
  service.on('message', async (message) => {
    if (message.isGroup) return;

    const content =
      message.body ||
      message.content ||
      message.text ||
      message.message ||
      "";

    const isBonus =
      content.includes("Bonus-Heist") ||
      content.includes("معزز") ||
      content.includes("Heist") ||
      content.includes("معزز إضافي");

    if (!isBonus) return;

    const roomId = extractRoomId(content);
    if (!roomId) return;

    console.log(`📥 [${index + 1}] استلم: ${roomId}`);

    addToQueue(roomId);

    if (!isResting) {
      processQueue();
    }
  });

  // =====================
  // ⏱️ دورة 54 / 6
  // =====================
  async function cycle() {
    while (true) {

      console.log(`🟢 [${index + 1}] تشغيل 54 دقيقة`);
      isResting = false;

      processQueue();

      await sleep(WORK_TIME);

      console.log(`🛑 [${index + 1}] راحة 6 دقائق`);
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
