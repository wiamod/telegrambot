const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const fs = require("fs");

// ================== ENV ==================
const TOKEN = process.env.TOKEN;
if (!TOKEN) throw new Error("TOKEN topilmadi. Railway Variables ga TOKEN qo‘ying.");

const ADMINS_ENV = String(process.env.ADMINS || "7547097467,6393574485");
const ADMINS = ADMINS_ENV
  .split(",")
  .map((x) => Number(String(x).trim()))
  .filter((n) => Number.isFinite(n));

// Owner ID: agar OWNER_ID env bo‘lsa o‘sha, bo‘lmasa ADMINS[0]
const OWNER_ID = Number(process.env.OWNER_ID || ADMINS[0] || 7547097467);

const CHANNEL_LINK = process.env.CHANNEL_LINK || "https://t.me/dasturchibot001";
const ADMIN_CONTACT = process.env.ADMIN_CONTACT || "@Startapadmin001";

const PREMIUM_PRICE = Number(process.env.PREMIUM_PRICE || 20000);
const PREMIUM_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 kun

// ================== REFERRAL SETTINGS ==================
const REF_TARGET = Number(process.env.REF_TARGET || 10); // 10 ta do‘st
const REF_REWARD_DAYS = Number(process.env.REF_REWARD_DAYS || 30); // 30 kun premium

// Railway domain
const PUBLIC_DOMAIN =
  process.env.RAILWAY_PUBLIC_DOMAIN ||
  (process.env.RAILWAY_STATIC_URL
    ? process.env.RAILWAY_STATIC_URL.replace("https://", "")
    : null);

const PORT = process.env.PORT || 3000;

// ================== SIMPLE DB (db.json) ==================
const DB_FILE = "./db.json";

function loadDB() {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));

    // eski format bo‘lsa moslab olamiz
    if (Array.isArray(raw.quiz)) {
      raw.quiz = { math: raw.quiz, en: [], ru: [], bio: [] };
    } else if (!raw.quiz || typeof raw.quiz !== "object") {
      raw.quiz = { math: [], en: [], ru: [], bio: [] };
    }

    raw.users = raw.users || {};
    raw.premium = raw.premium || {};
    raw.admins = raw.admins || {};
    raw.faq = raw.faq || {};
    raw.premiumContent = raw.premiumContent || { books: [], channels: [], videos: [] };

    // ✅ REFERRAL DB
    raw.referrals = raw.referrals || {};
    // referrals[userId] = { invited: [userId,userId], invitedBy: "123" | null, rewardedAt: 0 }

    raw.quiz.math = Array.isArray(raw.quiz.math) ? raw.quiz.math : [];
    raw.quiz.en = Array.isArray(raw.quiz.en) ? raw.quiz.en : [];
    raw.quiz.ru = Array.isArray(raw.quiz.ru) ? raw.quiz.ru : [];
    raw.quiz.bio = Array.isArray(raw.quiz.bio) ? raw.quiz.bio : [];

    raw.premiumContent.books = Array.isArray(raw.premiumContent.books) ? raw.premiumContent.books : [];
    raw.premiumContent.channels = Array.isArray(raw.premiumContent.channels) ? raw.premiumContent.channels : [];
    raw.premiumContent.videos = Array.isArray(raw.premiumContent.videos) ? raw.premiumContent.videos : [];

    return raw;
  } catch {
    return {
      users: {},
      premium: {},
      admins: {},
      faq: {},
      quiz: { math: [], en: [], ru: [], bio: [] },
      premiumContent: { books: [], channels: [], videos: [] },
      referrals: {},
    };
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = loadDB();

function ensureOwnerAdmin() {
  if (OWNER_ID && !db.admins[String(OWNER_ID)]) {
    db.admins[String(OWNER_ID)] = true;
    saveDB(db);
  }
}
ensureOwnerAdmin();

function ensureUser(msg) {
  const id = String(msg.from.id);
  if (!db.users[id]) {
    db.users[id] = {
      id: msg.from.id,
      username: msg.from.username || "",
      first_name: msg.from.first_name || "",
      joinedAt: Date.now(),
    };
    saveDB(db);
  }
}

function ensureReferral(userId) {
  const id = String(userId);
  if (!db.referrals[id]) {
    db.referrals[id] = { invited: [], invitedBy: null, rewardedAt: 0 };
    saveDB(db);
  }
}

function isAdminUser(userId) {
  if (ADMINS.includes(Number(userId))) return true;
  return !!db.admins[String(userId)];
}

function isPremiumUser(userId) {
  const p = db.premium[String(userId)];
  if (!p) return false;

  if (Date.now() > p.expireAt) {
    delete db.premium[String(userId)];
    saveDB(db);
    return false;
  }
  return true;
}

function givePremium(userId, days = REF_REWARD_DAYS) {
  const duration = days * 24 * 60 * 60 * 1000;
  db.premium[String(userId)] = { addedAt: Date.now(), expireAt: Date.now() + duration };
  saveDB(db);
}

// Referral hisoblash (yangi user start ref bilan kirdi)
async function handleReferralJoin(newUserId, refId) {
  const newbie = String(newUserId);
  const inviter = String(refId);

  ensureReferral(newbie);
  ensureReferral(inviter);

  // o‘zini-o‘zi taklif qilmasin
  if (newbie === inviter) return;

  // newbie oldin taklif bilan kirgan bo‘lsa qayta yozilmasin
  if (db.referrals[newbie].invitedBy) return;

  // inviterga qayta qo‘shilmasin
  if (!db.referrals[inviter].invited.includes(newbie)) {
    db.referrals[inviter].invited.push(newbie);
  }

  db.referrals[newbie].invitedBy = inviter;
  saveDB(db);

  const count = db.referrals[inviter].invited.length;

  // inviterga xabar
  bot.sendMessage(inviter, `🎉 Yangi do‘st qo‘shildi!\n👥 Takliflar: ${count}/${REF_TARGET}`)
    .catch(() => {});

  // 10 ta bo‘lsa premium sovg‘a
  if (count >= REF_TARGET && !isPremiumUser(inviter) && !db.referrals[inviter].rewardedAt) {
    givePremium(inviter, REF_REWARD_DAYS);
    db.referrals[inviter].rewardedAt = Date.now();
    saveDB(db);

    bot.sendMessage(inviter, `🎁 Tabriklaymiz!\nSiz ${REF_TARGET} ta do‘st taklif qildingiz va Premium sovg‘a oldingiz! 💎\n⏳ ${REF_REWARD_DAYS} kun`)
      .catch(() => {});
  }
}

// ================== SCHEDULE DATA (1 haftalik) ==================
const SCHEDULES = {
  "8-A": {
    Dushanba: ["Kelajak soati", "Ona tili", "Algebra", "Ingliz tili", "Rus tili"],
    Seshanba: ["Geometriya", "Kimyo", "Fizika", "Davlat huquq asoslari", "Jismoniy tarbiya", "O'zbekiston tarixi"],
    Chorshanba: ["Adabiyot", "Jaxon tarixi", "Chizmachilik", "Ona tili", "Ingliz tili", "Texnologiya"],
    Payshanba: ["Fizika", "Jismoniy tarbiya", "Ona tili", "Biologiya", "Ingliz tili"],
    Juma: ["Adabiyot", "Geografiya", "Algebra", "Biologiya", "Informatika", "O'zbekiston tarixi"],
    Shanba: ["Algebra", "Geografiya", "Kimyo", "Rus tili", "Tarbiya", "Geometriya"],
  },
  "6-A": {
    Dushanba: ["Matematika", "Ingliz tili", "Fizika", "Adabiyot"],
    Seshanba: ["Ona tili", "Biologiya", "Informatika", "Tarix"],
    Chorshanba: ["Kimyo", "Matematika", "Geografiya", "Sport"],
    Payshanba: ["Fizika", "Ingliz tili", "Adabiyot", "Musiqa"],
    Juma: ["Informatika", "Matematika", "Tarbiya soati", "Rasm"],
    Shanba: ["Test kuni 🧠"],
  },
};

// ================== DEFAULT FAQ + QUIZ ==================
if (!Object.keys(db.faq).length) {
  db.faq = {
    "Bot nima qiladi?": "Bu bot dars jadvali, test va savol-javoblar beradi.",
    "Bot 24/7 ishlaydimi?": "Ha ✅ Railway serverda bo‘lsa 24/7 ishlaydi.",
    "Premium nima?": "Premium bo‘limda maxsus kontent bo‘ladi.",
    "Admin kim?": `Admin: ${ADMIN_CONTACT}`,
  };
}

// Default quizlar (4 kategoriya)
function ensureDefaultQuizzes() {
  const hasAny =
    db.quiz.math.length || db.quiz.en.length || db.quiz.ru.length || db.quiz.bio.length;

  if (hasAny) return;

  db.quiz.math = [
    { q: "2 + 2 = ?", options: ["3", "4", "5"], a: "4" },
    { q: "10 - 7 = ?", options: ["1", "2", "3"], a: "3" },
  ];
  db.quiz.en = [
    { q: "Translate: Apple", options: ["Olma", "Anor", "Uzum"], a: "Olma" },
    { q: "Choose: I ___ a student.", options: ["am", "is", "are"], a: "am" },
  ];
  db.quiz.ru = [
    { q: "Перевод: Спасибо", options: ["Rahmat", "Salom", "Xayr"], a: "Rahmat" },
    { q: "Выберите: Я ___ дома.", options: ["есть", "буду", "в"], a: "в" },
  ];
  db.quiz.bio = [
    { q: "O‘simliklar ovqatni qayerda tayyorlaydi?", options: ["Bargda", "Ildizda", "Gulda"], a: "Bargda" },
  ];
}
ensureDefaultQuizzes();

// Premium kontent default (bo‘sh bo‘lsa)
function ensureDefaultPremiumContent() {
  const pc = db.premiumContent;
  const hasAny = pc.books.length || pc.channels.length || pc.videos.length;
  if (hasAny) return;

  pc.books = [{ title: "📘 Matematika darslik (namuna)", url: "https://example.com/math.pdf" }];
  pc.channels = [{ title: "📢 Premium kanal (namuna)", url: "https://t.me/your_premium_channel" }];
  pc.videos = [{ title: "🎥 Video dars (namuna)", url: "https://youtube.com/" }];
}
ensureDefaultPremiumContent();

saveDB(db);

// ================== QUIZ STATE ==================
const quizState = {}; // userId -> { categoryKey, index, score, active }

// ================== MENUS ==================
function getMainMenu(userId) {
  const premiumVisible = isPremiumUser(userId) || isAdminUser(userId);

  const rows = [
    ["📅 Dars jadvali", "🧠 Test"],
    ["❓ Savol-javob", "📚 Kurslar"],
    ["💎 Premium", "💰 Narxlar"],
    ["👥 Do‘st taklif qilish"],
    ["📢 Kanal", "👤 Admin"],
    ["ℹ️ Yordam"],
  ];

  if (premiumVisible) rows.splice(4, 0, ["🔒 Premium bo‘lim"]);

  return { reply_markup: { keyboard: rows, resize_keyboard: true } };
}

const adminMenu = {
  reply_markup: {
    keyboard: [
      ["📣 Broadcast", "👥 Statistika"],
      ["📈 Referal statistika", "🔄 Referal reset"], // ✅ QO‘SHILDI
      ["➕ Premium qo‘shish", "➖ Premium olib tashlash"],
      ["➕ Admin qo‘shish", "➖ Admin olib tashlash"],
      ["➕ FAQ qo‘shish", "➖ FAQ o‘chirish"],
      ["➕ Quiz qo‘shish", "➖ Quiz o‘chirish"],
      ["➕ Premium kontent", "➖ Premium kontent"],
      ["📋 Premium ro‘yxat", "📋 Admin ro‘yxat"],
      ["📋 FAQ ro‘yxat", "📋 Quiz ro‘yxat"],
      ["📋 Premium kontent ro‘yxat"],
      ["⬅️ Orqaga (Menu)"],
    ],
    resize_keyboard: true,
  },
};

function classesKeyboard() {
  const classes = Object.keys(SCHEDULES);
  const rows = [];
  for (let i = 0; i < classes.length; i += 2) rows.push(classes.slice(i, i + 2));
  rows.push(["⬅️ Orqaga (Menu)"]);
  return { reply_markup: { keyboard: rows, resize_keyboard: true } };
}

const quizCategoryKeyboard = {
  reply_markup: {
    keyboard: [
      ["➕ Matematika", "🇬🇧 Ingliz tili"],
      ["🇷🇺 Rus tili", "🧬 Biologiya"],
      ["⬅️ Orqaga (Menu)"],
    ],
    resize_keyboard: true,
  },
};

const QUIZ_CATEGORIES = {
  "➕ Matematika": { key: "math", title: "Matematika" },
  "🇬🇧 Ingliz tili": { key: "en", title: "Ingliz tili" },
  "🇷🇺 Rus tili": { key: "ru", title: "Rus tili" },
  "🧬 Biologiya": { key: "bio", title: "Biologiya" },
};

const premiumMenu = {
  reply_markup: {
    keyboard: [
      ["📘 Darsliklar", "📢 Premium kanallar"],
      ["🎥 Video darslar"],
      ["⬅️ Orqaga (Menu)"],
    ],
    resize_keyboard: true,
  },
};

const adminQuizCategoryKeyboard = quizCategoryKeyboard;
const adminPremiumCategoryKeyboard = {
  reply_markup: {
    keyboard: [
      ["📘 Darsliklar", "📢 Premium kanallar"],
      ["🎥 Video darslar"],
      ["⬅️ Orqaga (Menu)"],
    ],
    resize_keyboard: true,
  },
};

function ask(chatId, text, menu) {
  return bot.sendMessage(chatId, text, menu || {});
}

// ================== BOT + WEBHOOK ==================
const bot = new TelegramBot(TOKEN);

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("Bot ishlayapti 🚀"));

app.get("/api/status", async (req, res) => {
  try {
    const me = await bot.getMe();
    res.json({ ok: true, username: me.username });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post("/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ================== ADMIN STATE ==================
const adminState = {};
// broadcast
// addPremium/removePremium/addAdmin/removeAdmin (ID)
// addFAQ (q,a) delFAQ
// addQuizCategory -> addQuiz
// delQuizCategory -> delQuiz
// addPremiumContentCategory -> addPremiumContent (title,url)
// delPremiumContentCategory -> delPremiumContent (index)
// ✅ resetReferral (ID)

function takeId(text) {
  return String(text || "").replace(/\D/g, "");
}

function quizArrayByKey(key) {
  if (!db.quiz[key]) db.quiz[key] = [];
  return db.quiz[key];
}

function premiumArrayByButton(btnText) {
  if (btnText === "📘 Darsliklar") return db.premiumContent.books;
  if (btnText === "📢 Premium kanallar") return db.premiumContent.channels;
  if (btnText === "🎥 Video darslar") return db.premiumContent.videos;
  return null;
}

function categoryNameByKey(key) {
  if (key === "math") return "Matematika";
  if (key === "en") return "Ingliz tili";
  if (key === "ru") return "Rus tili";
  if (key === "bio") return "Biologiya";
  return key;
}

// ================== COMMANDS ==================
bot.onText(/\/start(?:\s+(\d+))?/, async (msg, match) => {
  ensureUser(msg);
  ensureOwnerAdmin();

  const newUserId = msg.from.id;
  ensureReferral(newUserId);

  const refId = match && match[1] ? match[1] : null;
  if (refId) await handleReferralJoin(newUserId, refId);

  ask(msg.chat.id, "Salom, Mirkomil StartApp Bot! 👋\nMenu orqali tanlang:", getMainMenu(msg.from.id));
});

bot.onText(/\/menu/, (msg) => {
  ensureUser(msg);
  ask(msg.chat.id, "📌 Menu:", getMainMenu(msg.from.id));
});

bot.onText(/\/myid/, (msg) => {
  ensureUser(msg);
  ask(msg.chat.id, `Sizning ID: ${msg.from.id}`, getMainMenu(msg.from.id));
});

// ================== MAIN HANDLER ==================
bot.on("message", async (msg) => {
  ensureUser(msg);
  ensureOwnerAdmin();

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = (msg.text || "").trim();

  if (text.startsWith("/")) return;

  // ✅ REF MENU BUTTON
  if (text === "👥 Do‘st taklif qilish") {
    ensureReferral(userId);
    const count = db.referrals[String(userId)]?.invited?.length || 0;

    let botUsername = "";
    try {
      const me = await bot.getMe();
      botUsername = me.username;
    } catch {}

    const link = botUsername
      ? `https://t.me/${botUsername}?start=${userId}`
      : "Bot username topilmadi. Keyinroq qayta urinib ko‘ring.";

    return ask(
      chatId,
      `👥 Do‘st taklif qiling va Premium oling!\n\n` +
        `🔗 Sizning referal link:\n${link}\n\n` +
        `📌 Takliflar: ${count}/${REF_TARGET}\n` +
        `🎁 ${REF_TARGET} ta do‘st bo‘lsa → Premium (${REF_REWARD_DAYS} kun) sovg‘a!`,
      getMainMenu(userId)
    );
  }

  // ===== ADMIN MODES =====
  if (isAdminUser(userId) && adminState[userId]?.mode) {
    const st = adminState[userId];

    if (st.mode === "broadcast") {
      adminState[userId] = null;
      const userIds = Object.keys(db.users);
      let sent = 0;
      for (const uid of userIds) {
        try { await bot.sendMessage(uid, `📣 E'lon:\n${text}`); sent++; } catch {}
      }
      return ask(chatId, `✅ Broadcast yuborildi: ${sent}/${userIds.length}`, adminMenu);
    }

    // ✅ REFERAL RESET MODE (ID)
    if (st.mode === "resetReferral") {
      const target = takeId(text);
      if (!target) return ask(chatId, "❌ ID topilmadi. Masalan: 123456789", adminMenu);

      ensureReferral(target);
      // targetni taklif qilganlar ro‘yxatidan ham o‘chirib tashlaymiz
      const inviter = db.referrals[target]?.invitedBy;
      if (inviter && db.referrals[String(inviter)]?.invited) {
        db.referrals[String(inviter)].invited = db.referrals[String(inviter)].invited.filter((x) => String(x) !== String(target));
      }

      db.referrals[target] = { invited: [], invitedBy: null, rewardedAt: 0 };
      saveDB(db);

      adminState[userId] = null;
      return ask(chatId, `✅ Referal reset qilindi: ${target}`, adminMenu);
    }

    if (["addPremium", "removePremium", "addAdmin", "removeAdmin"].includes(st.mode)) {
      const target = takeId(text);
      if (!target) return ask(chatId, "❌ ID topilmadi. Masalan: 123456789", adminMenu);

      if (st.mode === "addPremium") {
        db.premium[target] = { addedAt: Date.now(), expireAt: Date.now() + PREMIUM_DURATION };
        saveDB(db);
        try { await bot.sendMessage(target, "🎉 Sizga Premium yoqildi! /start"); } catch {}
        adminState[userId] = null;
        return ask(chatId, `✅ Premium qo‘shildi: ${target}`, adminMenu);
      }
      if (st.mode === "removePremium") {
        delete db.premium[target];
        saveDB(db);
        try { await bot.sendMessage(target, "ℹ️ Premium o‘chirildi."); } catch {}
        adminState[userId] = null;
        return ask(chatId, `✅ Premium olib tashlandi: ${target}`, adminMenu);
      }
      if (st.mode === "addAdmin") {
        db.admins[target] = true;
        saveDB(db);
        try { await bot.sendMessage(target, "🎉 Siz Admin bo‘ldingiz! /start"); } catch {}
        adminState[userId] = null;
        return ask(chatId, `✅ Admin qo‘shildi: ${target}`, adminMenu);
      }
      if (st.mode === "removeAdmin") {
        delete db.admins[target];
        saveDB(db);
        try { await bot.sendMessage(target, "ℹ️ Adminlik olib tashlandi."); } catch {}
        adminState[userId] = null;
        return ask(chatId, `✅ Admin olib tashlandi: ${target}`, adminMenu);
      }
    }

    // FAQ
    if (st.mode === "addFAQ") {
      if (st.step === 1) {
        st.temp = { q: text };
        st.step = 2;
        return ask(chatId, "Endi javobini yozing:", adminMenu);
      } else {
        db.faq[st.temp.q] = text;
        saveDB(db);
        adminState[userId] = null;
        return ask(chatId, `✅ FAQ qo‘shildi:\nQ: ${st.temp.q}\nA: ${text}`, adminMenu);
      }
    }
    if (st.mode === "delFAQ") {
      if (db.faq[text]) {
        delete db.faq[text];
        saveDB(db);
        adminState[userId] = null;
        return ask(chatId, `✅ FAQ o‘chirildi: ${text}`, adminMenu);
      }
      return ask(chatId, "❌ Topilmadi. Savolni aynan ro‘yxatdagidek yozing:", adminMenu);
    }

    // Quiz category choose -> add quiz
    if (st.mode === "addQuizCategory") {
      const cat = QUIZ_CATEGORIES[text];
      if (!cat) return ask(chatId, "Kategoriya tanlang 👇", adminQuizCategoryKeyboard);

      adminState[userId] = { mode: "addQuiz", step: 1, temp: {}, categoryKey: cat.key };
      return ask(chatId, `✅ Kategoriya: ${cat.title}\nYangi quiz savolini yozing:`, adminMenu);
    }
    if (st.mode === "addQuiz") {
      const key = st.categoryKey;
      const arr = quizArrayByKey(key);

      if (st.step === 1) {
        st.temp = { q: text };
        st.step = 2;
        return ask(chatId, "Variantlarni vergul bilan yozing.\nMasalan: A,B,C", adminMenu);
      }
      if (st.step === 2) {
        const options = text.split(",").map((s) => s.trim()).filter(Boolean);
        if (options.length < 2) return ask(chatId, "❌ Kamida 2 ta variant kerak. Masalan: 3,4,5", adminMenu);
        st.temp.options = options;
        st.step = 3;
        return ask(chatId, `To‘g‘ri javobni aynan variantdan yozing.\nVariantlar:\n${options.join("\n")}`, adminMenu);
      }
      if (st.step === 3) {
        const ans = text.trim();
        if (!st.temp.options.includes(ans)) return ask(chatId, "❌ Javob variantlar ichida bo‘lishi kerak. Qayta yozing:", adminMenu);
        arr.push({ q: st.temp.q, options: st.temp.options, a: ans });
        saveDB(db);
        adminState[userId] = null;
        return ask(chatId, `✅ Quiz qo‘shildi!\nKategoriya: ${categoryNameByKey(key)}\nSavol: ${st.temp.q}`, adminMenu);
      }
    }

    // Delete quiz
    if (st.mode === "delQuizCategory") {
      const cat = QUIZ_CATEGORIES[text];
      if (!cat) return ask(chatId, "Kategoriya tanlang 👇", adminQuizCategoryKeyboard);

      const arr = quizArrayByKey(cat.key);
      adminState[userId] = { mode: "delQuiz", categoryKey: cat.key };
      const list = arr.map((x, i) => `${i + 1}) ${x.q}`).join("\n") || "Hozircha quiz yo‘q";
      return ask(chatId, `Kategoriya: ${cat.title}\nO‘chirmoqchi bo‘lgan quiz raqamini yozing:\n${list}`, adminMenu);
    }
    if (st.mode === "delQuiz") {
      const key = st.categoryKey;
      const arr = quizArrayByKey(key);
      const n = Number(text);
      if (!Number.isFinite(n) || n < 1 || n > arr.length) return ask(chatId, `❌ Raqam noto‘g‘ri. 1 dan ${arr.length} gacha yozing:`, adminMenu);
      const removed = arr.splice(n - 1, 1)[0];
      saveDB(db);
      adminState[userId] = null;
      return ask(chatId, `✅ Quiz o‘chirildi!\nKategoriya: ${categoryNameByKey(key)}\nSavol: ${removed.q}`, adminMenu);
    }

    // Premium content add (choose category)
    if (st.mode === "addPremiumContentCategory") {
      const arr = premiumArrayByButton(text);
      if (!arr) return ask(chatId, "Qaysi turga qo‘shamiz? Tanlang 👇", adminPremiumCategoryKeyboard);

      adminState[userId] = { mode: "addPremiumContent", step: 1, temp: {}, targetBtn: text };
      return ask(chatId, `✅ Tanlandi: ${text}\nKontent nomini yozing (masalan: Matematika PDF):`, adminMenu);
    }
    if (st.mode === "addPremiumContent") {
      const arr = premiumArrayByButton(st.targetBtn);
      if (!arr) { adminState[userId] = null; return ask(chatId, "❌ Xato kategoriya.", adminMenu); }

      if (st.step === 1) {
        st.temp = { title: text };
        st.step = 2;
        return ask(chatId, "Endi linkni yuboring (https://...):", adminMenu);
      } else {
        const url = text;
        arr.push({ title: st.temp.title, url });
        saveDB(db);
        adminState[userId] = null;
        return ask(chatId, `✅ Premium kontent qo‘shildi!\n${st.temp.title}\n${url}`, adminMenu);
      }
    }

    // Premium content delete: choose category
    if (st.mode === "delPremiumContentCategory") {
      const arr = premiumArrayByButton(text);
      if (!arr) return ask(chatId, "Qaysi turdan o‘chiramiz? Tanlang 👇", adminPremiumCategoryKeyboard);

      adminState[userId] = { mode: "delPremiumContent", targetBtn: text };
      const list = arr.map((x, i) => `${i + 1}) ${x.title}`).join("\n") || "— bo‘sh —";
      return ask(chatId, `O‘chirmoqchi bo‘lgan raqamni yozing:\n${list}`, adminMenu);
    }
    if (st.mode === "delPremiumContent") {
      const arr = premiumArrayByButton(st.targetBtn);
      if (!arr) { adminState[userId] = null; return ask(chatId, "❌ Xato kategoriya.", adminMenu); }

      const n = Number(text);
      if (!Number.isFinite(n) || n < 1 || n > arr.length) return ask(chatId, `❌ Raqam noto‘g‘ri. 1 dan ${arr.length} gacha yozing:`, adminMenu);

      const removed = arr.splice(n - 1, 1)[0];
      saveDB(db);
      adminState[userId] = null;
      return ask(chatId, `✅ O‘chirildi: ${removed.title}`, adminMenu);
    }
  }

  // ===== QUIZ PLAY MODE =====
  if (quizState[userId]?.active) {
    const st = quizState[userId];
    const arr = quizArrayByKey(st.categoryKey);
    const cur = arr[st.index];

    if (!cur) {
      delete quizState[userId];
      return ask(chatId, "❌ Bu kategoriyada test yo‘q.", getMainMenu(userId));
    }

    if (text === cur.a) st.score++;

    st.index++;
    if (st.index >= arr.length) {
      const score = st.score;
      const total = arr.length;
      const catName = categoryNameByKey(st.categoryKey);
      delete quizState[userId];
      return ask(chatId, `✅ Test tugadi!\nKategoriya: ${catName}\nBall: ${score}/${total}`, getMainMenu(userId));
    }

    const next = arr[st.index];
    return ask(chatId, `🧠 (${categoryNameByKey(st.categoryKey)}) Savol ${st.index + 1}/${arr.length}:\n${next.q}\n\n${next.options.join("\n")}`, getMainMenu(userId));
  }

  // ===== MAIN MENU =====
  if (text === "⬅️ Orqaga (Menu)") return ask(chatId, "📌 Menu:", getMainMenu(userId));

  if (text === "📅 Dars jadvali") return ask(chatId, "Qaysi sinf? Tanlang 👇", classesKeyboard());

  if (SCHEDULES[text]) {
    const week = SCHEDULES[text];
    let out = `📅 ${text} — 1 haftalik dars jadvali\n\n`;
    for (const day of Object.keys(week)) out += `📌 ${day}:\n- ${week[day].join("\n- ")}\n\n`;
    return ask(chatId, out, getMainMenu(userId));
  }

  if (text === "🧠 Test") return ask(chatId, "🧠 Qaysi bo‘limdan test ishlaysiz? Tanlang 👇", quizCategoryKeyboard);

  if (QUIZ_CATEGORIES[text]) {
    const cat = QUIZ_CATEGORIES[text];
    const arr = quizArrayByKey(cat.key);
    if (!arr.length) return ask(chatId, `❌ ${cat.title} bo‘limida test yo‘q.\nAdmin quiz qo‘shishi kerak.`, getMainMenu(userId));

    quizState[userId] = { categoryKey: cat.key, index: 0, score: 0, active: true };
    const q = arr[0];
    return ask(chatId, `🧠 Test boshlandi!\nKategoriya: ${cat.title}\nSavol 1/${arr.length}:\n${q.q}\n\n${q.options.join("\n")}`, getMainMenu(userId));
  }

  if (text === "❓ Savol-javob") {
    const list = Object.keys(db.faq);
    const textList = list.length ? list.map((q, i) => `${i + 1}) ${q}`).join("\n") : "Hozircha FAQ yo‘q.";
    return ask(chatId, `❓ Savollar ro‘yxati:\n${textList}\n\nSavolni aynan yozsangiz javob beraman ✅`, getMainMenu(userId));
  }

  if (db.faq[text]) return ask(chatId, `✅ ${db.faq[text]}`, getMainMenu(userId));

  if (text === "📚 Kurslar") return ask(chatId, "📚 Kurslar:\n1) Telegram bot\n2) Jadval bot\n3) Quiz bot", getMainMenu(userId));

  if (text === "💎 Premium") {
    if (isPremiumUser(userId)) {
      const exp = new Date(db.premium[String(userId)].expireAt).toLocaleDateString();
      return ask(chatId, `💎 Siz Premium usersiz ✅\n⏳ Tugash: ${exp}\n\n🔒 Premium bo‘lim menyuda chiqadi.`, getMainMenu(userId));
    }
    return ask(chatId,
      `💎 Premium obuna\n\nNarx: ${PREMIUM_PRICE.toLocaleString()} so‘m / oy\n\n` +
      `Premium imkoniyatlari:\n✅ Ko‘proq testlar\n✅ Premium bo‘lim\n✅ Darsliklar/kanallar/video\n\n` +
      `Ulash uchun admin: ${ADMIN_CONTACT}`,
      getMainMenu(userId)
    );
  }

  // ===== PREMIUM SECTION =====
  if (text === "🔒 Premium bo‘lim") {
    if (!isPremiumUser(userId) && !isAdminUser(userId)) {
      return ask(chatId, `🔒 Bu bo‘lim faqat Premium uchun.\nAdmin: ${ADMIN_CONTACT}`, getMainMenu(userId));
    }
    return ask(chatId, "🔒 Premium bo‘limga xush kelibsiz! Tanlang 👇", premiumMenu);
  }

  if (text === "📘 Darsliklar" || text === "📢 Premium kanallar" || text === "🎥 Video darslar") {
    if (!isPremiumUser(userId) && !isAdminUser(userId)) return ask(chatId, "🔒 Premium emasiz.", getMainMenu(userId));

    const arr = premiumArrayByButton(text);
    const out = (arr && arr.length)
      ? arr.map((x, i) => `${i + 1}) ${x.title}\n${x.url}`).join("\n\n")
      : "Hozircha kontent yo‘q.";

    return ask(chatId, `${text}\n\n${out}`, premiumMenu);
  }

  // ===== OTHER =====
  const PRICES_TEXT =
    "💰 Narxlar:\n\n" +
    `💎 Premium: ${PREMIUM_PRICE.toLocaleString()} so‘m / oy\n` +
    "👑 Admin: 100 000 so‘m / oy\n";
  if (text === "💰 Narxlar") return ask(chatId, PRICES_TEXT, getMainMenu(userId));

  if (text === "📢 Kanal") return ask(chatId, `📢 Kanal: ${CHANNEL_LINK}`, getMainMenu(userId));

  if (text === "👤 Admin") {
    if (!isAdminUser(userId)) return ask(chatId, `👤 Admin: ${ADMIN_CONTACT}`, getMainMenu(userId));
    return ask(chatId, "🔧 Admin panel:", adminMenu);
  }

  if (text === "ℹ️ Yordam") {
    return ask(chatId,
      "ℹ️ Yordam:\n/start — boshlash\n/menu — menu\n/myid — ID olish\n\n" +
      "📅 Jadval: sinfni tanlaysan → haftalik jadval\n" +
      "🧠 Test: bo‘lim tanlaysan → variantdan javob berasan\n" +
      `👥 Do‘st taklif: ${REF_TARGET} ta bo‘lsa premium sovg‘a\n` +
      "💎 Premium: premium bo‘limni ochadi (faqat premium/admin)\n",
      getMainMenu(userId)
    );
  }

  // ===== ADMIN BUTTONS =====
  if (isAdminUser(userId) && text === "📣 Broadcast") {
    adminState[userId] = { mode: "broadcast" };
    return ask(chatId, "📣 Hamma userlarga yuboriladigan matnni yozing:", adminMenu);
  }

  if (isAdminUser(userId) && text === "👥 Statistika") {
    const usersCount = Object.keys(db.users).length;
    const premiumCount = Object.keys(db.premium).length;
    const adminCount = Object.keys(db.admins).length;

    const quizCount =
      quizArrayByKey("math").length +
      quizArrayByKey("en").length +
      quizArrayByKey("ru").length +
      quizArrayByKey("bio").length;

    return ask(
      chatId,
      `👥 Userlar: ${usersCount}\n💎 Premium: ${premiumCount}\n👑 Admin: ${adminCount}\n🧠 Quiz (jami): ${quizCount}`,
      adminMenu
    );
  }

  // ✅ REFERAL STATISTIKA (ADMIN)
  if (isAdminUser(userId) && text === "📈 Referal statistika") {
    const all = db.referrals || {};
    const ids = Object.keys(all);

    let totalInvites = 0;
    let rewarded = 0;

    const top = ids
      .map((id) => ({
        id,
        count: (all[id]?.invited?.length || 0),
        rewarded: !!all[id]?.rewardedAt,
      }))
      .sort((a, b) => b.count - a.count);

    totalInvites = top.reduce((s, x) => s + x.count, 0);
    rewarded = top.filter((x) => x.rewarded).length;

    const top10 = top.slice(0, 10)
      .map((x, i) => `${i + 1}) ${x.id} — ${x.count} ta ${x.rewarded ? "🎁" : ""}`)
      .join("\n") || "Hozircha yo‘q";

    return ask(
      chatId,
      `📈 Referal statistika\n\n` +
        `👤 Referal ishlatgan userlar: ${ids.length}\n` +
        `👥 Umumiy takliflar: ${totalInvites}\n` +
        `🎁 Mukofot olganlar: ${rewarded}\n\n` +
        `🏆 TOP-10:\n${top10}`,
      adminMenu
    );
  }

  // ✅ REFERAL RESET (ADMIN)
  if (isAdminUser(userId) && text === "🔄 Referal reset") {
    adminState[userId] = { mode: "resetReferral" };
    return ask(chatId, "🔄 Qaysi userning referalini reset qilamiz?\nUSER ID yuboring:", adminMenu);
  }

  // qolgan admin tugmalaring (premium/admin/faq/quiz/premium content) — sening kodingda bor,
  // bu yerda hammasini ushlab turish uchun pastdagi umumiy javobga tushadi.

  if (isAdminUser(userId) && text === "➕ Premium qo‘shish") {
    adminState[userId] = { mode: "addPremium" };
    return ask(chatId, "➕ Premium beriladigan USER ID ni yuboring. (User /myid orqali oladi)", adminMenu);
  }
  if (isAdminUser(userId) && text === "➖ Premium olib tashlash") {
    adminState[userId] = { mode: "removePremium" };
    return ask(chatId, "➖ Premium olib tashlanadigan USER ID ni yuboring:", adminMenu);
  }

  if (isAdminUser(userId) && text === "➕ Admin qo‘shish") {
    adminState[userId] = { mode: "addAdmin" };
    return ask(chatId, "➕ Admin qilinadigan USER ID ni yuboring:", adminMenu);
  }
  if (isAdminUser(userId) && text === "➖ Admin olib tashlash") {
    adminState[userId] = { mode: "removeAdmin" };
    return ask(chatId, "➖ Adminlikdan olinadigan USER ID ni yuboring:", adminMenu);
  }

  if (isAdminUser(userId) && text === "➕ FAQ qo‘shish") {
    adminState[userId] = { mode: "addFAQ", step: 1, temp: {} };
    return ask(chatId, "Yangi savolni yozing:", adminMenu);
  }
  if (isAdminUser(userId) && text === "➖ FAQ o‘chirish") {
    adminState[userId] = { mode: "delFAQ" };
    const list = Object.keys(db.faq).map((q, i) => `${i + 1}) ${q}`).join("\n");
    return ask(chatId, `O‘chirmoqchi bo‘lgan savolni aynan yozing:\n${list}`, adminMenu);
  }

  if (isAdminUser(userId) && text === "➕ Quiz qo‘shish") {
    adminState[userId] = { mode: "addQuizCategory" };
    return ask(chatId, "Qaysi bo‘limga quiz qo‘shamiz? Tanlang 👇", adminQuizCategoryKeyboard);
  }
  if (isAdminUser(userId) && text === "➖ Quiz o‘chirish") {
    adminState[userId] = { mode: "delQuizCategory" };
    return ask(chatId, "Qaysi bo‘limdan quiz o‘chiramiz? Tanlang 👇", adminQuizCategoryKeyboard);
  }

  if (isAdminUser(userId) && text === "➕ Premium kontent") {
    adminState[userId] = { mode: "addPremiumContentCategory" };
    return ask(chatId, "Qaysi turga qo‘shamiz? Tanlang 👇", adminPremiumCategoryKeyboard);
  }
  if (isAdminUser(userId) && text === "➖ Premium kontent") {
    adminState[userId] = { mode: "delPremiumContentCategory" };
    return ask(chatId, "Qaysi turdan o‘chiramiz? Tanlang 👇", adminPremiumCategoryKeyboard);
  }

  if (isAdminUser(userId) && text === "📋 Premium kontent ro‘yxat") {
    const mk = (title, arr) => {
      const list = arr.length ? arr.map((x, i) => `${i + 1}) ${x.title}\n${x.url}`).join("\n\n") : "— bo‘sh —";
      return `${title}\n${list}`;
    };

    return ask(chatId,
      "📋 Premium kontent:\n\n" +
      mk("📘 Darsliklar:", db.premiumContent.books) + "\n\n" +
      mk("📢 Premium kanallar:", db.premiumContent.channels) + "\n\n" +
      mk("🎥 Video darslar:", db.premiumContent.videos),
      adminMenu
    );
  }

  if (isAdminUser(userId) && text === "📋 Premium ro‘yxat") {
    const list = Object.keys(db.premium);
    if (!list.length) return ask(chatId, "📋 Premium ro‘yxat bo‘sh.", adminMenu);
    return ask(chatId, "📋 Premium userlar:\n" + list.map((x) => "• " + x).join("\n"), adminMenu);
  }

  if (isAdminUser(userId) && text === "📋 Admin ro‘yxat") {
    const list = [...new Set([...Object.keys(db.admins), ...ADMINS.map(String)])];
    if (!list.length) return ask(chatId, "📋 Admin ro‘yxat bo‘sh.", adminMenu);
    return ask(chatId, "📋 Adminlar:\n" + list.map((x) => "• " + x).join("\n"), adminMenu);
  }

  if (isAdminUser(userId) && text === "📋 FAQ ro‘yxat") {
    const list = Object.keys(db.faq);
    if (!list.length) return ask(chatId, "📋 FAQ bo‘sh.", adminMenu);
    return ask(chatId, "📋 FAQ:\n" + list.map((q, i) => `${i + 1}) ${q}`).join("\n"), adminMenu);
  }

  if (isAdminUser(userId) && text === "📋 Quiz ro‘yxat") {
    const mk = (key, emoji) => {
      const arr = quizArrayByKey(key);
      const list = arr.map((x, i) => `${i + 1}) ${x.q}`).join("\n") || "— bo‘sh —";
      return `${emoji} ${categoryNameByKey(key)}:\n${list}`;
    };

    return ask(chatId,
      "📋 Quiz ro‘yxat (kategoriya bo‘yicha):\n\n" +
      mk("math", "➕") + "\n\n" +
      mk("en", "🇬🇧") + "\n\n" +
      mk("ru", "🇷🇺") + "\n\n" +
      mk("bio", "🧬"),
      adminMenu
    );
  }

  return ask(chatId, "Menuni ishlating 👇", getMainMenu(userId));
});

// ================== START SERVER + SET WEBHOOK ==================
app.listen(PORT, async () => {
  console.log("✅ Server ready on port", PORT);

  if (!PUBLIC_DOMAIN) {
    console.log("⚠️ RAILWAY_PUBLIC_DOMAIN topilmadi. Railway Networking -> domain borligini tekshiring.");
    return;
  }

  const webhookUrl = `https://${PUBLIC_DOMAIN}/webhook`;
  try {
    await bot.setWebHook(webhookUrl);
    console.log("✅ Webhook set:", webhookUrl);
  } catch (e) {
    console.log("❌ Webhook set error:", e);
  }
});

// Premium muddati tekshirish (har 1 soat)
setInterval(() => {
  let changed = false;

  for (const userId in db.premium) {
    if (Date.now() > db.premium[userId].expireAt) {
      delete db.premium[userId];
      changed = true;

      bot.sendMessage(
        userId,
        "ℹ️ Premium obunangiz tugadi.\nYangilash uchun admin bilan bog‘laning."
      ).catch(() => {});
    }
  }

  if (changed) saveDB(db);
}, 60 * 60 * 1000);
