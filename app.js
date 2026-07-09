import 'dotenv/config';
import wolfjs from 'wolf.js';

const { WOLF } = wolfjs;

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
            await client.messaging.sendGroupMessage(channelId, command);
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
        this.lastTurnTime = {}; // تخزين وقت آخر تشغيل لكل حساب (عشان الطاقة)
        this.clientsMap = new Map();
    }
    registerClient(index, config, client, triggerFunc) {
        this.clientsMap.set(index, { config, client, triggerFunc });
    }
    async handleRaceEndMessage(body) {
        if (body.includes("انتهى السباق")) {
            const match = body.match(/\((\d+)\)\s*$/);
            if (match && match[1]) {
                const extractedId = match[1];
                const currentTurnBot = this.clientsMap.get(this.currentTurnIndex);
                if (!currentTurnBot) return;

                if (extractedId === String(currentTurnBot.config.id)) {
                    console.log(`🏁 [السباق] الحساب ${currentTurnBot.config.name} أنهى سباقه.`);
                    this.currentTurnIndex = this.currentTurnIndex >= 12 ? 1 : this.currentTurnIndex + 1;
                    this.triggerNext();
                }
            }
        }
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

    client.on('groupMessage', async (message) => {
        if (message.sourceSubscriberId === TRACKED_BOT_ID) {
            await raceManager.handleRaceEndMessage(message.body.trim());
        }
    });

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
