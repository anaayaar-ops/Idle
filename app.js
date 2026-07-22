import 'dotenv/config';
import wolfjs from 'wolf.js';

const { WOLF } = wolfjs;

// ==================================================
// إعدادات - عدّل القيم دي حسب حالتك
// ==================================================
const ROOM_ID = 82038178;          // آيدي الروم
const WOLFDLE_BOT_ID = 82641759;       // ⚠️ حط آيدي بوت WOLFdle هنا لو تعرفه (اختياري للفلترة)

const client = new WOLF();

client.on('ready', async () => {
  console.log('✅ تم تسجيل الدخول! جاري مراقبة رسائل الجروب...');
  console.log('📋 هيتم طباعة أي رسالة تجي من الجروب بالتفصيل (body / content / embeds).');
});

client.on('message', async (message) => {
  try {
    // نطبع بس رسائل الجروب المحدد
    if (!message.isGroup || Number(message.targetGroupId || message.roomId) !== ROOM_ID) return;

    // لو حددت آيدي البوت، فلتر عليه بس. لو مش محدد، هيطبع كل رسائل الجروب
    if (WOLFDLE_BOT_ID && Number(message.sourceSubscriberId) !== WOLFDLE_BOT_ID) return;

    console.log('\n========== رسالة جديدة ==========');
    console.log('from (sourceSubscriberId):', message.sourceSubscriberId);
    console.log('isGroup:', message.isGroup);
    console.log('type/mimeType:', message.mimeType || message.type);
    console.log('--- body (raw) ---');
    console.log(message.body);
    console.log('--- content (raw) ---');
    console.log(message.content);
    console.log('--- embeds (raw) ---');
    console.log(JSON.stringify(message.embeds, null, 2));
    console.log('--- الرسالة كاملة (JSON) ---');
    console.log(JSON.stringify(message, (key, value) => {
      // نتفادى الحلقات اللانهائية والـ objects الضخمة
      if (key === 'client' || key === '_client') return undefined;
      return value;
    }, 2));
    console.log('==================================\n');
  } catch (err) {
    console.log('خطأ أثناء طباعة الرسالة:', err.message);
  }
});

client.on('messageUpdate', async (message) => {
  try {
    if (!message.isGroup || Number(message.targetGroupId || message.roomId) !== ROOM_ID) return;
    if (WOLFDLE_BOT_ID && Number(message.sourceSubscriberId) !== WOLFDLE_BOT_ID) return;

    console.log('\n========== تحديث رسالة (messageUpdate) ==========');
    console.log('from:', message.sourceSubscriberId);
    console.log('body:', message.body);
    console.log('content:', message.content);
    console.log('embeds:', JSON.stringify(message.embeds, null, 2));
    console.log('===================================================\n');
  } catch (err) {
    console.log('خطأ أثناء طباعة تحديث الرسالة:', err.message);
  }
});

client.on('error', (error) => {
  console.error('❌ خطأ:', error?.message || error);
});

client.on('disconnected', () => {
  console.log('⚠️ انقطع الاتصال.');
});

try {
  await client.login(process.env.U_MAIL, process.env.U_PASS);
} catch (error) {
  console.error('❌ فشل تسجيل الدخول:', error?.message);
}
