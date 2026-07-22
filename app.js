import 'dotenv/config';
import wolfjs from 'wolf.js';

process.env.SUPPRESS_NO_CONFIG_WARNING = 'true';

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

// ==================================================
// الإعدادات ومتغيرات اللعبة
// ==================================================
const { WOLF } = wolfjs;

const ROOM_ID = 22249609;        
const XO_BOT_ID = 82727814;      
const START_COMMAND = '!xo private ai 3';     

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// متغيرات حالة البوت (تم استبدال service بـ client)
let client = null;
let isBotReady = false;

// متغيرات حالة اللعبة
let board = Array(9).fill(null); 
let mySign = 'X';     
let botSign = 'O';    
let lastPlayedIndex = -1; 
let isGameEnding = false; 
let isSending = false; 

const WINNING_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], 
  [0, 3, 6], [1, 4, 7], [2, 5, 8], 
  [0, 4, 8], [2, 4, 6]             
];

// ==================================================
// استراتيجية اللعب (الذكاء الاصطناعي)
// ==================================================
function getBestMove() {
  const availableMoves = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) availableMoves.push(i);
  }
  
  if (availableMoves.length === 0) return undefined;

  for (let combo of WINNING_COMBOS) {
    let myCount = combo.filter(i => board[i] === mySign).length;
    let emptyCount = combo.filter(i => board[i] === null).length;
    if (myCount === 2 && emptyCount === 1) return combo.find(i => board[i] === null);
  }

  for (let combo of WINNING_COMBOS) {
    let botCount = combo.filter(i => board[i] === botSign).length;
    let emptyCount = combo.filter(i => board[i] === null).length;
    if (botCount === 2 && emptyCount === 1) return combo.find(i => board[i] === null);
  }

  for (let move of availableMoves) {
    board[move] = mySign;
    let winningLines = 0;
    for (let combo of WINNING_COMBOS) {
      let myCount = combo.filter(i => board[i] === mySign).length;
      let emptyCount = combo.filter(i => board[i] === null).length;
      if (myCount === 2 && emptyCount === 1) winningLines++;
    }
    board[move] = null;
    if (winningLines >= 2) return move;
  }

  if (board[4] === null && availableMoves.includes(4)) return 4;

  const corners = [0, 2, 6, 8];
  const availableCorners = corners.filter(i => board[i] === null);
  if (availableCorners.length > 0) {
    return availableCorners[Math.floor(Math.random() * availableCorners.length)];
  }

  return availableMoves[Math.floor(Math.random() * availableMoves.length)];
}

// ==================================================
// معالجة وقراءة البيانات وتحديث الجولات تلقائياً
// ==================================================
function handleIncomingData(message) {
  const text = (message.body || message.content || '').toLowerCase();

  if (
    text.includes('won') || text.includes('lost') || text.includes('tie') || 
    text.includes('draw') || text.includes('تعادل') || text.includes('rematch') || 
    text.includes('game over') || text.includes('expires')
  ) {
    if (!isGameEnding) {
      isGameEnding = true; 
      isSending = false;
      console.log('🏁 تم رصد نهاية المباراة حتماً. جاري بدء جولة جديدة تلقائياً خلال 5 ثوانٍ...');
      board = Array(9).fill(null);
      lastPlayedIndex = -1;

      setTimeout(async () => {
        await sendGroupMessage(ROOM_ID, START_COMMAND);
        isGameEnding = false; 
      }, 5000);
    }
    return;
  }

  if (text.includes('game started') || text.includes('بدأت اللعبة')) {
    console.log('🎮 جولة جديدة انطلقت، تصفير مصفوفة اللوحة...');
    board = Array(9).fill(null);
    lastPlayedIndex = -1;
    isGameEnding = false;
    isSending = false;
  }

  if (text.includes('your turn! (❌)') || text.includes('turn! (❌)') || text.includes('your turn! (x)')) {
    mySign = 'X';
    botSign = 'O';
  } else if (text.includes('your turn! (⭕)') || text.includes('turn! (⭕)') || text.includes('your turn! (o)')) {
    mySign = 'O';
    botSign = 'X';
  }

  const positions = text.split('xobot-mp-private__content__middle__position');
  if (positions.length > 1) {
    for (let i = 0; i < 9; i++) {
      const block = positions[i + 1] || '';
      if (block.includes('--x') || block.includes('❌') || block.includes('position--x')) {
        board[i] = 'X';
      } else if (block.includes('--o') || block.includes('⭕') || block.includes('position--o')) {
        board[i] = 'O';
      } else {
        board[i] = null; 
      }
    }
  }

  const isMyTurn = text.includes('your turn') || text.includes('turn') || text.includes('xobot-mp-private__content__top__turn');

  if (isMyTurn && !isGameEnding && !isSending) {
    const moveIndex = getBestMove();
    if (moveIndex !== undefined && moveIndex !== -1) {
      const squareToPlay = (moveIndex + 1).toString();
      
      isSending = true; 
      board[moveIndex] = mySign;
      lastPlayedIndex = moveIndex; 

      const secureDelay = Math.floor(Math.random() * (1300 - 900 + 1)) + 900; 
      console.log(`✨ رمزي النشط: [ ${mySign} ] | ⏳ تأخير الإرسال: [ ${secureDelay}ms ] | الرقم: [ ${squareToPlay} ]`);
      
      setTimeout(async () => {
        await sendPrivateMessageWithRetry(XO_BOT_ID, squareToPlay);
      }, secureDelay); 
    }
  }
}

// ==================================================
// نظام إرسال الأوامر للعبة
// ==================================================
async function sendPrivateMessageWithRetry(targetId, text, attempt = 1) {
  if (!client || !isBotReady) {
    isSending = false;
    return;
  }

  try {
    await client.messaging.sendPrivateMessage(targetId, text);
    lastPlayedIndex = -1;
    setTimeout(() => { isSending = false; }, 800);
  } catch (err) {
    console.log(`⚠️ فشل إرسال رقم [ ${text} ] محاولة [ ${attempt} ]: ${err.message}`);
    if (attempt < 3 && !isGameEnding) {
      setTimeout(() => {
        sendPrivateMessageWithRetry(targetId, text, attempt + 1);
      }, 500);
    } else {
      lastPlayedIndex = -1;
      isSending = false;
    }
  }
}

async function sendGroupMessage(roomId, text) {
  if (!client || !isBotReady) return;
  try { await client.messaging.sendGroupMessage(roomId, text); } catch (err) {}
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

  // أحداث اللعبة
  client.on('message', async (message) => {
    const senderId = Number(message.sourceSubscriberId);
    if (!message.isGroup && senderId === XO_BOT_ID) {
      const text = (message.body || message.content || '').toLowerCase();
      if (text.includes('already been used') || text.includes('used')) {
        lastPlayedIndex = -1;
        isSending = false; 
      }
      handleIncomingData(message);
    }
  });

  client.on('messageUpdate', async (message) => {
    const senderId = Number(message.sourceSubscriberId);
    if (!message.isGroup && senderId === XO_BOT_ID) {
      isSending = false;
      handleIncomingData(message);
    }
  });

  // حدث النجاح
  client.on('ready', async () => {
    isReconnecting = false;
    if (readyTimeout) clearTimeout(readyTimeout);
    
    console.log('✅ تم تسجيل الدخول! البوت متصل وجاهز للعمل.');
    console.log('🚀 الكود الآن يحتوي على التنظيف والدخول الذكي والسرعة.');
    
    isBotReady = true;
    await sleep(2000);
    await sendGroupMessage(ROOM_ID, START_COMMAND);
  });

  // أحداث الأخطاء والانقطاع
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

  // تسجيل الدخول الفعلي
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

  // مؤقت الأمان ضد التعليق
  readyTimeout = setTimeout(() => {
    console.log('⚠️ لم يستجب سيرفر وولف (ready) خلال المهلة، سيتم تبديل العميل.');
    isReconnecting = false;
    cleanOldClient();
    scheduleReconnect('لم يكتمل تسجيل الدخول (تعليق)');
  }, 25000);
}

// بدء تشغيل النظام
loginWithFreshClient();
