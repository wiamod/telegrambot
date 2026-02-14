const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const fs = require("fs");

// ================== ENV ==================
const TOKEN = process.env.TOKEN;
if (!TOKEN) throw new Error("TOKEN topilmadi. Railway Variables ga TOKEN qo‘ying.");

const OWNER_ID = Number(process.env.OWNER_ID || 0); // /myid bilan olasan
const CHANNEL_LINK = process.env.CHANNEL_LINK || "https://t.me/your_channel";
const ADMIN_CONTACT = "@Mirkomilallayorov01";
const PRICES_TEXT =
  "💰 Narxlar:\n\n" +
  "💎 Premium: 20 000 so‘m / oy\n" +
  "👑 Admin: 100 000 so‘m / oy\n\n" +
  "Hozircha to‘lov yo‘q — keyin oxirida ulaymiz.";

// Railway domen
const PUBLIC_DOMAIN =
  process.env.RAILWAY_PUBLIC_DOMAIN ||
  (process.env.RAILWAY_STATIC_URL ? process.env.RAILWAY_STATIC_URL.replace("https://", "") : null);

const PORT = process.env.PORT || 3000;

// ================== SIMPLE DB (db.json) ==================
const DB_FILE = "./db.json";

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return {
      users: {},      // userId -> info
      premium: {},    // userId -> {addedAt}
      admins: {},     // userId -> true
      faq: {},        // question -> answer
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
function isAdmin(userId) {
  return !!db.admins[String(userId)];
}
function isPremium(userId) {
  return !!db.premium[String(userId)];
}

// ================== SCHEDULE DATA (1 haftalik) ==================
// ✅ Shu yerga sinflaringni qo‘shib ko‘paytirasan
const SCHEDULES = {
  "5-A": {
    "Dushanba": ["Matematika", "Ona tili", "Ingliz tili", "Tarix"],
    "Seshanba": ["Fizika", "Matematika", "Ingliz tili", "Musiqa"],
    "Chorshanba": ["Biologiya", "Ona tili", "Informatika", "Jismoniy tarbiya"],
    "Payshanba": ["Kimyo", "Matematika", "Geografiya", "Adabiyot"],
    "Juma": ["Informatika", "Fizika", "Tarbiya soati", "Sport"],
    "Shanba": ["Test kuni 🧠"],
  },
  "6-A": {
    "Dushanba": ["Matematika", "Ingliz tili", "Fizika", "Adabiyot"],
    "Seshanba": ["Ona tili", "Biologiya", "Informatika", "Tarix"],
    "Chorshanba": ["Kimyo", "Matematika", "Geografiya", "Sport"],
    "Payshanba": ["Fizika", "Ingliz tili", "Adabiyot", "Musiqa"],
    "Juma": ["Informatika", "Matematika", "Tarbiya soati", "Rasm"],
    "Shanba": ["Test kuni 🧠"],
  },
};

// ================== FAQ (savol-javob) ==================
// db.faq bo‘sh bo‘lsa, boshlang‘ich to‘ldirib qo‘yamiz
if (!Object.keys(db.faq).length) {
  db.faq = {
    "Bot nima qiladi?": "Bu bot dars jadvali, test va savol-javoblar beradi.",
    "Bot 24/7 ishlaydimi?": "Ha ✅ Railway serverda bo‘lsa 24/7 ishlaydi.",
    "Premium nima?": "Premium bo‘limda maxsus kontent bo‘ladi (to‘lovni keyin qo‘shamiz).",
    "Admin kim?": `Admin: ${ADMIN_CONTACT}`,
  };
  saveDB(db);
}

// ================== QUIZ (test) ==================
const QUIZ = [
  { q: "2 + 2 = ?", options: ["3", "4", "5"], a: "4" },
  { q: "O‘zbekiston poytaxti?", options: ["Toshkent", "Samarqand", "Buxoro"], a: "Toshkent" },
  { q: "Node.js nima?", options: ["Runtime", "Brauzer", "O‘yin"], a: "Runtime" },
];

const quizState = {}; // userId -> { index, score, active }

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
      ["📋 Premium ro‘yxat", "📋 Admin ro‘yxat"],
      ["📋 FAQ ro‘yxat", "⬅️ Orqaga (Menu)"],
    ],
    resize_keyboard: true,
  },
};

// sinf tanlash menu (schedule)
function classesKeyboard() {
  const classes = Object.keys(SCHEDULES);
  const rows = [];
  for (let i = 0; i < classes.length; i += 2) {
    rows.push(classes.slice(i, i + 2));
  }
  rows.push(["⬅️ Orqaga (Menu)"]);
  return {
    reply_markup: { keyboard: rows, resize_keyboard: true },
  };
}

// ================== ADMIN STATE (matn kiritish bosqichlari) ==================
const adminState = {}; 
// adminState[adminId] = { mode: "broadcast"|"addPremium"|"removePremium"|"addAdmin"|"removeAdmin"|"addFAQ"|"delFAQ", step, temp }

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

  // komandani qayta tutmaymiz
  if (text.startsWith("/")) return;

  // -------- ADMIN MODES --------
  if (isAdmin(userId) && adminState[userId]?.mode) {
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

    // Add Premium / Remove Premium / Add Admin / Remove Admin (ID kiritiladi)
    const takeId = () => text.replace(/\D/g, "");
    if (["addPremium","removePremium","addAdmin","removeAdmin"].includes(st.mode)) {
      const target = takeId();
      if (!target) return ask(chatId, "❌ ID topilmadi. Masalan: 123456789", adminMenu);

      if (st.mode === "addPremium") {
        db.premium[target] = { addedAt: Date.now() };
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

    // Delete FAQ: question exact
    if (st.mode === "delFAQ") {
      if (db.faq[text]) {
        delete db.faq[text];
        saveDB(db);
        adminState[userId] = null;
        return ask(chatId, `✅ FAQ o‘chirildi: ${text}`, adminMenu);
      }
      return ask(chatId, "❌ Topilmadi. Savolni aynan ro‘yxatdagidek yozing:", adminMenu);
    }
  }

  // -------- QUIZ MODE (javob kutish) --------
  if (quizState[userId]?.active) {
    const st = quizState[userId];
    const cur = QUIZ[st.index];
    if (text === cur.a) st.score++;

    st.index++;
    if (st.index >= QUIZ.length) {
      const score = st.score;
      delete quizState[userId];
      return ask(chatId, `✅ Test tugadi!\nBall: ${score}/${QUIZ.length}`, mainMenu);
    }

    const next = QUIZ[st.index];
    return ask(chatId, `🧠 Savol ${st.index + 1}/${QUIZ.length}:\n${next.q}\n\n${next.options.join("\n")}`, mainMenu);
  }

  // -------- MAIN MENU ACTIONS --------
  if (text === "⬅️ Orqaga (Menu)") {
    return ask(chatId, "📌 Menu:", mainMenu);
  }

  if (text === "📅 Dars jadvali") {
    return ask(chatId, "Qaysi sinf? Tanlang 👇", classesKeyboard());
  }

  // sinf tanlansa haftalik jadval chiqarish
  if (SCHEDULES[text]) {
    const week = SCHEDULES[text];
    let out = `📅 ${text} — 1 haftalik dars jadvali\n\n`;
    for (const day of Object.keys(week)) {
      out += `📌 ${day}:\n- ${week[day].join("\n- ")}\n\n`;
    }
    return ask(chatId, out, mainMenu);
  }

  if (text === "🧠 Test") {
    quizState[userId] = { index: 0, score: 0, active: true };
    const q = QUIZ[0];
    return ask(chatId, `🧠 Test boshlandi!\nSavol 1/${QUIZ.length}:\n${q.q}\n\n${q.options.join("\n")}`, mainMenu);
  }

  if (text === "❓ Savol-javob") {
    const list = Object.keys(db.faq);
    const textList = list.length ? list.map((q, i) => `${i + 1}) ${q}`).join("\n") : "Hozircha FAQ yo‘q.";
    return ask(chatId, `❓ Savollar ro‘yxati:\n${textList}\n\nSavolni aynan yozsangiz javob beraman ✅`, mainMenu);
  }

  if (db.faq[text]) {
    return ask(chatId, `✅ ${db.faq[text]}`, mainMenu);
  }

  if (text === "📚 Kurslar") {
    return ask(
      chatId,
      "📚 Kurslar (demo):\n1) Telegram bot (boshlang‘ich)\n2) Jadval bot\n3) Quiz bot\n\nKeyin to‘liq qilamiz ✅",
      mainMenu
    );
  }

  if (text === "💎 Premium") {
    return ask(
      chatId,
      "💎 Premium (info)\nPremium bo‘lsa maxsus testlar va darslar bo‘ladi.\nHozircha admin qo‘shib beradi ✅",
      mainMenu
    );
  }

  if (text === "🔒 Premium bo‘lim") {
    if (!isPremium(userId) && !isAdmin(userId)) {
      return ask(chatId, `🔒 Bu bo‘lim faqat Premium uchun.\nAdmin: ${ADMIN_CONTACT}`, mainMenu);
    }
    return ask(
      chatId,
      "🔒 Premium bo‘lim (demo)\n✅ Maxsus testlar\n✅ Yopiq darslar\n\nKeyin kengaytiramiz ✅",
      mainMenu
    );
  }

  if (text === "💰 Narxlar") {
    return ask(chatId, PRICES_TEXT, mainMenu);
  }

  if (text === "📢 Kanal") {
    return ask(chatId, `📢 Kanal: ${CHANNEL_LINK}`, mainMenu);
  }

  if (text === "👤 Admin") {
    if (!isAdmin(userId)) return ask(chatId, `👤 Admin: ${ADMIN_CONTACT}`, mainMenu);
    return ask(chatId, "🔧 Admin panel:", adminMenu);
  }

  if (isAdmin(userId) && text === "📣 Broadcast") {
    adminState[userId] = { mode: "broadcast" };
    return ask(chatId, "📣 Hamma userlarga yuboriladigan matnni yozing:", adminMenu);
  }

  if (isAdmin(userId) && text === "👥 Statistika") {
    const usersCount = Object.keys(db.users).length;
    const premiumCount = Object.keys(db.premium).length;
    const adminCount = Object.keys(db.admins).length;
    return ask(chatId, `👥 Userlar: ${usersCount}\n💎 Premium: ${premiumCount}\n👑 Admin: ${adminCount}`, adminMenu);
  }

  if (isAdmin(userId) && text === "➕ Premium qo‘shish") {
    adminState[userId] = { mode: "addPremium" };
    return ask(chatId, "➕ Premium beriladigan USER ID ni yuboring.\n(User /myid orqali oladi)", adminMenu);
  }

  if (isAdmin(userId) && text === "➖ Premium olib tashlash") {
    adminState[userId] = { mode: "removePremium" };
    return ask(chatId, "➖ Premium olib tashlanadigan USER ID ni yuboring:", adminMenu);
  }

  if (isAdmin(userId) && text === "➕ Admin qo‘shish") {
    adminState[userId] = { mode: "addAdmin" };
    return ask(chatId, "➕ Admin qilinadigan USER ID ni yuboring:", adminMenu);
  }

  if (isAdmin(userId) && text === "➖ Admin olib tashlash") {
    adminState[userId] = { mode: "removeAdmin" };
    return ask(chatId, "➖ Adminlikdan olinadigan USER ID ni yuboring:", adminMenu);
  }

  if (isAdmin(userId) && text === "➕ FAQ qo‘shish") {
    adminState[userId] = { mode: "addFAQ", step: 1, temp: {} };
    return ask(chatId, "Yangi savolni yozing (masalan: Bot 24/7 ishlaydimi?):", adminMenu);
  }

  if (isAdmin(userId) && text === "➖ FAQ o‘chirish") {
    adminState[userId] = { mode: "delFAQ" };
    const list = Object.keys(db.faq).map((q, i) => `${i + 1}) ${q}`).join("\n");
    return ask(chatId, `O‘chirmoqchi bo‘lgan savolni aynan yozing:\n${list}`, adminMenu);
  }

  if (isAdmin(userId) && text === "📋 Premium ro‘yxat") {
    const list = Object.keys(db.premium);
    if (!list.length) return ask(chatId, "📋 Premium ro‘yxat bo‘sh.", adminMenu);
    return ask(chatId, "📋 Premium userlar:\n" + list.map((x) => "• " + x).join("\n"), adminMenu);
  }

  if (isAdmin(userId) && text === "📋 Admin ro‘yxat") {
    const list = Object.keys(db.admins);
    if (!list.length) return ask(chatId, "📋 Admin ro‘yxat bo‘sh.", adminMenu);
    return ask(chatId, "📋 Adminlar:\n" + list.map((x) => "• " + x).join("\n"), adminMenu);
  }

  if (isAdmin(userId) && text === "📋 FAQ ro‘yxat") {
    const list = Object.keys(db.faq);
    if (!list.length) return ask(chatId, "📋 FAQ bo‘sh.", adminMenu);
    return ask(chatId, "📋 FAQ:\n" + list.map((q, i) => `${i + 1}) ${q}`).join("\n"), adminMenu);
  }

  if (text === "ℹ️ Yordam") {
    return ask(
      chatId,
      "ℹ️ Yordam:\n" +
        "/start — boshlash\n" +
        "/menu — menu\n" +
        "/myid — ID olish\n" +
        "/resetmenu — menu reset\n\n" +
        "📅 Jadval: sinfni tanlaysan → haftalik jadval chiqadi\n🧠 Test: savollarga variantdan javob berasan",
      mainMenu
    );
  }

  // Default
  return ask(chatId, "Menuni ishlating 👇", mainMenu);
});

// ================== START SERVER + SET WEBHOOK ==================
app.listen(PORT, async () => {
  console.log("✅ Server ready on port", PORT);

  if (!PUBLIC_DOMAIN) {
    console.log("⚠️ RAILWAY_PUBLIC_DOMAIN topilmadi. Railway Networking -> Generate Domain qiling.");
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
