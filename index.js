const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const fs = require("fs");

// ================== ENV ==================
const TOKEN = process.env.TOKEN;
if (!TOKEN) throw new Error("TOKEN topilmadi. Railway Variables ga TOKEN qo‘ying.");

// ADMINS: "7547097467,123456789"
const ADMINS_ENV = String(process.env.ADMINS || "7547097467,6393574485");
const ADMINS = ADMINS_ENV
  .split(",")
  .map((x) => Number(String(x).trim()))
  .filter((n) => Number.isFinite(n));

const OWNER_ID = Number(process.env.OWNER_ID || ADMINS[0] || 7547097467,6393574485);

const CHANNEL_LINK = process.env.CHANNEL_LINK || "@dasturchibot001";
const ADMIN_CONTACT = process.env.ADMIN_CONTACT || "@Startapadmin001";

const PREMIUM_PRICE = Number(process.env.PREMIUM_PRICE || 20000);
const PREMIUM_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 kun

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
      raw.quiz = {
        math: raw.quiz,
        en: [],
        ru: [],
        bio: [],
      };
    } else if (!raw.quiz || typeof raw.quiz !== "object") {
      raw.quiz = { math: [], en: [], ru: [], bio: [] };
    }

    raw.users = raw.users || {};
    raw.premium = raw.premium || {};
    raw.admins = raw.admins || {};
    raw.faq = raw.faq || {};

    // kategoriyalar yo‘q bo‘lsa to‘ldiramiz
    raw.quiz.math = Array.isArray(raw.quiz.math) ? raw.quiz.math : [];
    raw.quiz.en = Array.isArray(raw.quiz.en) ? raw.quiz.en : [];
    raw.quiz.ru = Array.isArray(raw.quiz.ru) ? raw.quiz.ru : [];
    raw.quiz.bio = Array.isArray(raw.quiz.bio) ? raw.quiz.bio : [];

    return raw;
  } catch {
    return {
      users: {},
      premium: {},
      admins: {},
      faq: {},
      quiz: { math: [], en: [], ru: [], bio: [] },
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

function isAdminUser(userId) {
  // ENV ADMINS + db.admins ikkalasi ham admin bo‘lsin
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
    "Premium nima?": "Premium bo‘limda maxsus kontent bo‘ladi (to‘lovni keyin qo‘shamiz).",
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
saveDB(db);

// ================== QUIZ STATE ==================
const quizState = {}; 
// userId -> { category, index, score, active }

// ================== MENUS ==================
const mainMenu = {
  reply_markup: {
    keyboard: [
      ["📅 Dars jadvali", "🧠 Test"],
      ["❓ Savol-javob", "📚 Kurslar"],
      ["💎 Premium", "🔒 Premium bo‘lim"],
      ["💰 Narxlar", "📢 Kanal"],
      ["👤 Admin", "ℹ️ Yordam"],
    ],
    resize_keyboard: true,
  },
};

const adminMenu = {
  reply_markup: {
    keyboard: [
      ["📣 Broadcast", "👥 Statistika"],
      ["➕ Premium qo‘shish", "➖ Premium olib tashlash"],
      ["➕ Admin qo‘shish", "➖ Admin olib tashlash"],
      ["➕ FAQ qo‘shish", "➖ FAQ o‘chirish"],
      ["➕ Quiz qo‘shish", "➖ Quiz o‘chirish"],
      ["📋 Premium ro‘yxat", "📋 Admin ro‘yxat"],
      ["📋 FAQ ro‘yxat", "📋 Quiz ro‘yxat"],
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

// Test bo‘limlari (kategoriya)
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
// modes:
// broadcast
// addPremium/removePremium/addAdmin/removeAdmin (ID)
// addFAQ (step1 q, step2 a)
// delFAQ (q exact)
// addQuizCategory -> admin tanlaydi
// addQuiz (step1 q, step2 options, step3 answer) with category
// delQuizCategory -> admin tanlaydi
// delQuiz (index) with category

function takeId(text) {
  return String(text || "").replace(/\D/g, "");
}

function quizArrayByKey(key) {
  if (!db.quiz[key]) db.quiz[key] = [];
  return db.quiz[key];
}

function categoryNameByKey(key) {
  if (key === "math") return "Matematika";
  if (key === "en") return "Ingliz tili";
  if (key === "ru") return "Rus tili";
  if (key === "bio") return "Biologiya";
  return key;
}

// Admin kategoriya tanlash klaviaturalari
const adminQuizCategoryKeyboard = {
  reply_markup: {
    keyboard: [
      ["➕ Matematika", "🇬🇧 Ingliz tili"],
      ["🇷🇺 Rus tili", "🧬 Biologiya"],
      ["⬅️ Orqaga (Menu)"],
    ],
    resize_keyboard: true,
  },
};

// ================== COMMANDS ==================
bot.onText(/\/start/, (msg) => {
  ensureUser(msg);
  ensureOwnerAdmin();
  ask(msg.chat.id, "Salom, Mirkomil StartApp Bot! 👋\nMenu orqali tanlang:", mainMenu);
});

bot.onText(/\/menu/, (msg) => {
  ensureUser(msg);
  ask(msg.chat.id, "📌 Menu:", mainMenu);
});

bot.onText(/\/myid/, (msg) => {
  ensureUser(msg);
  ask(msg.chat.id, `Sizning ID: ${msg.from.id}`, mainMenu);
});

bot.onText(/\/resetmenu/, (msg) => {
  ensureUser(msg);
  bot.sendMessage(msg.chat.id, "Menu reset ✅", { reply_markup: { remove_keyboard: true } });
});

// ================== MAIN HANDLER ==================
bot.on("message", async (msg) => {
  ensureUser(msg);
  ensureOwnerAdmin();

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = (msg.text || "").trim();

  if (text.startsWith("/")) return;

  // -------- ADMIN MODES --------
  if (isAdminUser(userId) && adminState[userId]?.mode) {
    const st = adminState[userId];

    // Broadcast
    if (st.mode === "broadcast") {
      adminState[userId] = null;
      const userIds = Object.keys(db.users);
      let sent = 0;
      for (const uid of userIds) {
        try {
          await bot.sendMessage(uid, `📣 E'lon:\n${text}`);
          sent++;
        } catch {}
      }
      return ask(chatId, `✅ Broadcast yuborildi: ${sent}/${userIds.length}`, adminMenu);
    }

    // ID based
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

    // Add FAQ: step1 question, step2 answer
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

    // Delete FAQ
    if (st.mode === "delFAQ") {
      if (db.faq[text]) {
        delete db.faq[text];
        saveDB(db);
        adminState[userId] = null;
        return ask(chatId, `✅ FAQ o‘chirildi: ${text}`, adminMenu);
      }
      return ask(chatId, "❌ Topilmadi. Savolni aynan ro‘yxatdagidek yozing:", adminMenu);
    }

    // 1) Admin quiz category choose for ADD
    if (st.mode === "addQuizCategory") {
      const cat = QUIZ_CATEGORIES[text];
      if (!cat) return ask(chatId, "Kategoriya tanlang 👇", adminQuizCategoryKeyboard);

      adminState[userId] = { mode: "addQuiz", step: 1, temp: {}, categoryKey: cat.key };
      return ask(chatId, `✅ Kategoriya: ${cat.title}\nYangi quiz savolini yozing:`, adminMenu);
    }

    // 2) Add Quiz steps
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
        if (!st.temp.options.includes(ans)) {
          return ask(chatId, "❌ Javob variantlar ichida bo‘lishi kerak. Qayta yozing:", adminMenu);
        }
        arr.push({ q: st.temp.q, options: st.temp.options, a: ans });
        saveDB(db);
        adminState[userId] = null;
        return ask(chatId, `✅ Quiz qo‘shildi!\nKategoriya: ${categoryNameByKey(key)}\nSavol: ${st.temp.q}`, adminMenu);
      }
    }

    // 3) Admin quiz category choose for DELETE
    if (st.mode === "delQuizCategory") {
      const cat = QUIZ_CATEGORIES[text];
      if (!cat) return ask(chatId, "Kategoriya tanlang 👇", adminQuizCategoryKeyboard);

      const arr = quizArrayByKey(cat.key);
      adminState[userId] = { mode: "delQuiz", categoryKey: cat.key };
      const list = arr.map((x, i) => `${i + 1}) ${x.q}`).join("\n") || "Hozircha quiz yo‘q";
      return ask(chatId, `Kategoriya: ${cat.title}\nO‘chirmoqchi bo‘lgan quiz raqamini yozing:\n${list}`, adminMenu);
    }

    // 4) Delete Quiz by number (inside chosen category)
    if (st.mode === "delQuiz") {
      const key = st.categoryKey;
      const arr = quizArrayByKey(key);

      const n = Number(text);
      if (!Number.isFinite(n) || n < 1 || n > arr.length) {
        return ask(chatId, `❌ Raqam noto‘g‘ri. 1 dan ${arr.length} gacha yozing:`, adminMenu);
      }
      const removed = arr.splice(n - 1, 1)[0];
      saveDB(db);
      adminState[userId] = null;
      return ask(chatId, `✅ Quiz o‘chirildi!\nKategoriya: ${categoryNameByKey(key)}\nSavol: ${removed.q}`, adminMenu);
    }
  }

  // -------- QUIZ PLAY MODE --------
  if (quizState[userId]?.active) {
    const st = quizState[userId];
    const arr = quizArrayByKey(st.categoryKey);

    const cur = arr[st.index];
    if (!cur) {
      delete quizState[userId];
      return ask(chatId, "❌ Bu kategoriyada test topilmadi. Admin quiz qo‘shishi kerak.", mainMenu);
    }

    if (text === cur.a) st.score++;

    st.index++;
    if (st.index >= arr.length) {
      const score = st.score;
      const total = arr.length;
      const catName = categoryNameByKey(st.categoryKey);
      delete quizState[userId];
      return ask(chatId, `✅ Test tugadi!\nKategoriya: ${catName}\nBall: ${score}/${total}`, mainMenu);
    }

    const next = arr[st.index];
    return ask(
      chatId,
      `🧠 (${categoryNameByKey(st.categoryKey)}) Savol ${st.index + 1}/${arr.length}:\n${next.q}\n\n${next.options.join("\n")}`,
      mainMenu
    );
  }

  // -------- MAIN MENU --------
  if (text === "⬅️ Orqaga (Menu)") return ask(chatId, "📌 Menu:", mainMenu);

  if (text === "📅 Dars jadvali") return ask(chatId, "Qaysi sinf? Tanlang 👇", classesKeyboard());

  if (SCHEDULES[text]) {
    const week = SCHEDULES[text];
    let out = `📅 ${text} — 1 haftalik dars jadvali\n\n`;
    for (const day of Object.keys(week)) {
      out += `📌 ${day}:\n- ${week[day].join("\n- ")}\n\n`;
    }
    return ask(chatId, out, mainMenu);
  }

  // Test -> kategoriya tanlash
  if (text === "🧠 Test") {
    return ask(chatId, "🧠 Qaysi bo‘limdan test ishlaysiz? Tanlang 👇", quizCategoryKeyboard);
  }

  // kategoriya bosilganda test boshlash
  if (QUIZ_CATEGORIES[text]) {
    const cat = QUIZ_CATEGORIES[text];
    const arr = quizArrayByKey(cat.key);

    if (!arr.length) {
      return ask(chatId, `❌ ${cat.title} bo‘limida test yo‘q.\nAdmin quiz qo‘shishi kerak.`, mainMenu);
    }

    quizState[userId] = { categoryKey: cat.key, index: 0, score: 0, active: true };
    const q = arr[0];
    return ask(
      chatId,
      `🧠 Test boshlandi!\nKategoriya: ${cat.title}\nSavol 1/${arr.length}:\n${q.q}\n\n${q.options.join("\n")}`,
      mainMenu
    );
  }

  if (text === "❓ Savol-javob") {
    const list = Object.keys(db.faq);
    const textList = list.length ? list.map((q, i) => `${i + 1}) ${q}`).join("\n") : "Hozircha FAQ yo‘q.";
    return ask(chatId, `❓ Savollar ro‘yxati:\n${textList}\n\nSavolni aynan yozsangiz javob beraman ✅`, mainMenu);
  }

  if (db.faq[text]) return ask(chatId, `✅ ${db.faq[text]}`, mainMenu);

  if (text === "📚 Kurslar") return ask(chatId, "📚 Kurslar (demo):\n1) Telegram bot\n2) Jadval bot\n3) Quiz bot", mainMenu);

  if (text === "💎 Premium") {
    if (isPremiumUser(userId)) {
      const exp = new Date(db.premium[String(userId)].expireAt).toLocaleDateString();
      return ask(chatId, `💎 Siz Premium usersiz ✅\n⏳ Tugash: ${exp}`, mainMenu);
    }
    return ask(
      chatId,
      `💎 Premium obuna\n\nNarx: ${PREMIUM_PRICE.toLocaleString()} so‘m / oy\n\n` +
        `Premium imkoniyatlari:\n✅ Ko‘proq testlar\n✅ Premium bo‘lim\n✅ Maxsus kontent\n\n` +
        `Ulash uchun admin: ${ADMIN_CONTACT}`,
      mainMenu
    );
  }

  if (text === "🔒 Premium bo‘lim") {
    if (!isPremiumUser(userId) && !isAdminUser(userId)) {
      return ask(chatId, `🔒 Bu bo‘lim faqat Premium uchun.\nAdmin: ${ADMIN_CONTACT}`, mainMenu);
    }
    return ask(chatId, "🔒 Premium bo‘lim (demo): maxsus darslar, video, linklar ✅", mainMenu);
  }

  const PRICES_TEXT =
    "💰 Narxlar:\n\n" +
    `💎 Premium: ${PREMIUM_PRICE.toLocaleString()} so‘m / oy\n` +
    "👑 Admin: 100 000 so‘m / oy\n\n" +
    "Hozircha to‘lov yo‘q — keyin oxirida ulaymiz.";

  if (text === "💰 Narxlar") return ask(chatId, PRICES_TEXT, mainMenu);

  if (text === "📢 Kanal") return ask(chatId, `📢 Kanal: ${CHANNEL_LINK}`, mainMenu);

  if (text === "👤 Admin") {
    if (!isAdminUser(userId)) return ask(chatId, `👤 Admin: ${ADMIN_CONTACT}`, mainMenu);
    return ask(chatId, "🔧 Admin panel:", adminMenu);
  }

  if (text === "ℹ️ Yordam") {
    return ask(
      chatId,
      "ℹ️ Yordam:\n/start — boshlash\n/menu — menu\n/myid — ID olish\n/resetmenu — menu reset\n\n" +
        "📅 Jadval: sinfni tanlaysan → haftalik jadval\n🧠 Test: bo‘lim tanlaysan → variantdan javob berasan",
      mainMenu
    );
  }

  // -------- ADMIN BUTTONS --------
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

  if (isAdminUser(userId) && text === "➕ Premium qo‘shish") {
    adminState[userId] = { mode: "addPremium" };
    return ask(chatId, "➕ Premium beriladigan USER ID ni yuboring.\n(User /myid orqali oladi)", adminMenu);
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

  // Quiz qo‘shish: avval kategoriya tanlaydi
  if (isAdminUser(userId) && text === "➕ Quiz qo‘shish") {
    adminState[userId] = { mode: "addQuizCategory" };
    return ask(chatId, "Qaysi bo‘limga quiz qo‘shamiz? Tanlang 👇", adminQuizCategoryKeyboard);
  }

  // Quiz o‘chirish: avval kategoriya tanlaydi
  if (isAdminUser(userId) && text === "➖ Quiz o‘chirish") {
    adminState[userId] = { mode: "delQuizCategory" };
    return ask(chatId, "Qaysi bo‘limdan quiz o‘chiramiz? Tanlang 👇", adminQuizCategoryKeyboard);
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

    return ask(
      chatId,
      "📋 Quiz ro‘yxat (kategoriya bo‘yicha):\n\n" +
        mk("math", "➕") +
        "\n\n" +
        mk("en", "🇬🇧") +
        "\n\n" +
        mk("ru", "🇷🇺") +
        "\n\n" +
        mk("bio", "🧬"),
      adminMenu
    );
  }

  return ask(chatId, "Menuni ishlating 👇", mainMenu);
});

// ================== START SERVER + SET WEBHOOK ==================
app.listen(PORT, async () => {
  console.log("✅ Server ready on port", PORT);

  if (!PUBLIC_DOMAIN) {
    console.log("⚠️ RAILWAY_PUBLIC_DOMAIN topilmadi. Railway Settings -> Networking -> domain borligini tekshiring.");
    // PUBLIC_DOMAIN bo‘lmasa ham bot ishlashi mumkin (polling orqali),
    // lekin biz webhook ishlatyapmiz. Shuning uchun domain kerak.
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

      bot
        .sendMessage(
          userId,
          "ℹ️ Premium obunangiz tugadi.\nYangilash uchun admin bilan bog‘laning."
        )
        .catch(() => {});
    }
  }

  if (changed) saveDB(db);
}, 60 * 60 * 1000);
