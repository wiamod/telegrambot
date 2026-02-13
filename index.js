const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const fs = require("fs");

const PROVIDER_TOKEN = process.env.PAYMENT_PROVIDER_TOKEN || "";
const PREMIUM_PRICE_UZS = Number(process.env.PREMIUM_PRICE_UZS || 20000);
// ================== CONFIG ==================
const token = process.env.TOKEN;
if (!token) {
  console.error("❌ TOKEN yo‘q! Railway Variables ga TOKEN qo‘ying.");
  process.exit(1);
}

const PUBLIC_DOMAIN =
  process.env.RAILWAY_PUBLIC_DOMAIN ||
  (process.env.RAILWAY_STATIC_URL ? process.env.RAILWAY_STATIC_URL.replace("https://", "") : null);

const PORT = process.env.PORT || 3000;

// 🔁 o'zingniki qilib qo'y
const CHANNEL_LINK = "https://t.me/your_channel";
const ADMIN_CONTACT = "@Mirkomilallayorov01";

// Narxlar (xohlasang o'zgartir)
const PRICES_TEXT =
  "💰 Narxlar:\n\n" +
  "💎 Premium: 20 000 so‘m / oy\n" +
  "👑 Admin: 100 000 so‘m / oy\n\n" +
  "To‘lovdan keyin sizga Premium yoki Admin yoqib beriladi.";

// ✅ O'zingni admin qilish:
// 1) botga /myid yoz -> ID chiqadi
// 2) shu yerga yoz
const OWNER_ID = 7547097467; // <-- masalan: 123456789

// ================== SIMPLE DB (db.json) ==================
const DB_FILE = "./db.json";
function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { users: {}, premium: {}, admins: {}, quiz: {} };
  }
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
let db = loadDB();

if (OWNER_ID && !db.admins[String(OWNER_ID)]) {
  db.admins[String(OWNER_ID)] = true;
  saveDB(db);
}

// ================== HELPERS ==================
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

// ================== MENUS ==================
const mainMenu = {
  reply_markup: {
    keyboard: [
      ["📚 Darslar","🧠 Test", "❓ Savol-javob"],
      [ "💎 Premium", "💰 Narxlar"],
      ["🔒 Premium bo‘lim", "👤 Admin"],
      ["📢 Kanal","💳 To‘lov"],
      ["⚙️ Sozlamalar","ℹ️ Yordam"]
     
    ],
    resize_keyboard: true,
  },
};

const faqMenu = {
  reply_markup: {
    keyboard: [
      ["🤖 Bot nima?", "🧭 Qanday ishlaydi?"],
      ["💳 Premium nima?", "🆘 Muammo bo‘lsa?"],
      ["📌 Bot 24/7 ishlaydimi?", "💬 Savol berish"],
      ["⬅️ Orqaga (Menu)"],
    ],
    resize_keyboard: true,
  },
};

const adminMenu = {
  reply_markup: {
    keyboard: [
      ["📣 Broadcast", "👥 Userlar soni"],
      ["➕ Premium qo‘shish", "➖ Premium olib tashlash"],
      ["➕ Admin qo‘shish", "➖ Admin olib tashlash"],
      ["📋 Premium ro‘yxat", "📋 Admin ro‘yxat"],
      ["⬅️ Orqaga (Menu)"],
    ],
    resize_keyboard: true,
  },
};

// ================== FAQ ==================
const FAQ = {
  "🤖 Bot nima?": "Bu bot sizga darslar, savol-javob, test va premium kontent bo‘yicha yordam beradi.",
  "🧭 Qanday ishlaydi?": "Menu tugmalaridan tanlang — bot avtomatik javob beradi.",
  "💳 Premium nima?": "Premium: yopiq darslar + maxsus funksiyalar. Keyin to‘lovni haqiqiy ulaymiz.",
  "🆘 Muammo bo‘lsa?": `Admin: ${ADMIN_CONTACT}`,
  "📌 Bot 24/7 ishlaydimi?": "Ha. Railway’da tursa — noutbuk o‘chiq bo‘lsa ham 24/7 ishlaydi.",
  "💬 Savol berish": "Savolingizni oddiy yozing (demo). Masalan: 'Node.js nima?'",
};

// ================== QUIZ ==================
const QUIZ = [
  { q: "JavaScript nima?", a: "til" },
  { q: "Node.js nima?", a: "runtime" },
  { q: "Telegram bot nima bilan yoziladi? (bizda)", a: "node" },
];

// quiz state: db.quiz[userId] = { index, score, active }
function startQuiz(userId) {
  db.quiz[String(userId)] = { index: 0, score: 0, active: true };
  saveDB(db);
}
function stopQuiz(userId) {
  delete db.quiz[String(userId)];
  saveDB(db);
}

// ================== BOT + WEBHOOK ==================
const bot = new TelegramBot(token);

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
  bot.sendMessage(msg.chat.id, "Salom! 👋\nMenu orqali tanlang:", mainMenu);
});

bot.onText(/\/menu/, (msg) => {
  ensureUser(msg);
  bot.sendMessage(msg.chat.id, "📌 Menu:", mainMenu);
});

bot.onText(/\/myid/, (msg) => {
  ensureUser(msg);
  bot.sendMessage(msg.chat.id, `Sizning ID: ${msg.from.id}`);
});

bot.onText(/\/resetmenu/, (msg) => {
  ensureUser(msg);
  bot.sendMessage(msg.chat.id, "Menu reset ✅", { reply_markup: { remove_keyboard: true } });
});

// ================== ADMIN STATE ==================
const adminState = {}; 
// adminState[adminId] = { mode: "broadcast" | "addPremium" | "removePremium" | "addAdmin" | "removeAdmin" }

// ================== MESSAGE HANDLER ==================
bot.on("message", async (msg) => {
  ensureUser(msg);

  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const userId = msg.from.id;

  if (text === "💳 To‘lov") {
    // Provider token yo'q bo'lsa — demo yo'l
    if (!PROVIDER_TOKEN) {
      return bot.sendMessage(
        chatId,
        "💳 To‘lov (DEMO)\n\n" +
        `Premium narx: ${PREMIUM_PRICE_UZS} so‘m / oy\n\n` +
        "Hozircha Telegram Payments ulanmagan.\n" +
        "To‘lov qilganingizdan keyin adminga chek yuborasiz, admin premium yoqib beradi ✅",
        mainMenu
      );
    }
  
    // Telegram Payments (provider token bor bo'lsa)
    return bot.sendInvoice(
      chatId,
      "Premium obuna",
      "Premium bo‘lim + maxsus darslar (1 oy)",
      `premium_${chatId}_${Date.now()}`, // payload
      PROVIDER_TOKEN,
      "UZS",
      [{ label: "Premium (1 oy)", amount: PREMIUM_PRICE_UZS * 100 }] // Telegram minor unit
    );
  }
  // komandalarni qayta ishlatmaymiz
  if (text.startsWith("/")) return;

  // ====== ADMIN MODE INPUT ======
  if (isAdmin(userId) && adminState[userId]?.mode) {
    const mode = adminState[userId].mode;

    if (mode === "broadcast") {
      adminState[userId] = null;
      const userIds = Object.keys(db.users);
      let sent = 0;
      for (const uid of userIds) {
        try {
          await bot.sendMessage(uid, `📣 E'lon:\n${text}`);
          sent++;
        } catch {}
      }
      return bot.sendMessage(chatId, `✅ Broadcast yuborildi: ${sent}/${userIds.length}`, adminMenu);
    }

    if (mode === "addPremium") {
      adminState[userId] = null;
      const target = text.replace(/\D/g, "");
      if (!target) return bot.sendMessage(chatId, "❌ ID topilmadi. Masalan: 123456789", adminMenu);

      db.premium[target] = { addedAt: Date.now() };
      saveDB(db);
      try { await bot.sendMessage(target, "🎉 Sizga Premium yoqildi! /start"); } catch {}
      return bot.sendMessage(chatId, `✅ Premium qo‘shildi: ${target}`, adminMenu);
    }

    if (mode === "removePremium") {
      adminState[userId] = null;
      const target = text.replace(/\D/g, "");
      if (!target) return bot.sendMessage(chatId, "❌ ID topilmadi. Masalan: 123456789", adminMenu);

      delete db.premium[target];
      saveDB(db);
      try { await bot.sendMessage(target, "ℹ️ Premium o‘chirildi."); } catch {}
      return bot.sendMessage(chatId, `✅ Premium olib tashlandi: ${target}`, adminMenu);
    }

    if (mode === "addAdmin") {
      adminState[userId] = null;
      const target = text.replace(/\D/g, "");
      if (!target) return bot.sendMessage(chatId, "❌ ID topilmadi. Masalan: 123456789", adminMenu);

      db.admins[target] = true;
      saveDB(db);
      try { await bot.sendMessage(target, "🎉 Siz Admin bo‘ldingiz! /start"); } catch {}
      return bot.sendMessage(chatId, `✅ Admin qo‘shildi: ${target}`, adminMenu);
    }

    if (mode === "removeAdmin") {
      adminState[userId] = null;
      const target = text.replace(/\D/g, "");
      if (!target) return bot.sendMessage(chatId, "❌ ID topilmadi. Masalan: 123456789", adminMenu);

      delete db.admins[target];
      saveDB(db);
      try { await bot.sendMessage(target, "ℹ️ Adminlik olib tashlandi."); } catch {}
      return bot.sendMessage(chatId, `✅ Admin olib tashlandi: ${target}`, adminMenu);
    }
  }

  // ====== QUIZ INPUT (agar quiz active bo'lsa) ======
  const qstate = db.quiz[String(userId)];
  if (qstate?.active) {
    const current = QUIZ[qstate.index];
    const ans = (text || "").toLowerCase();
    if (ans.includes(current.a)) qstate.score++;

    qstate.index++;
    if (qstate.index >= QUIZ.length) {
      const score = qstate.score;
      stopQuiz(userId);
      return bot.sendMessage(chatId, `✅ Test tugadi!\nBall: ${score}/${QUIZ.length}`, mainMenu);
    } else {
      saveDB(db);
      return bot.sendMessage(chatId, `Keyingi savol:\n${QUIZ[qstate.index].q}`, mainMenu);
    }
  }

  // ====== MAIN MENU BUTTONS ======
  if (text === "📚 Darslar") {
    return bot.sendMessage(
      chatId,
      "📚 Darslar (demo)\n1) JavaScript\n2) Node.js\n3) Telegram Bot\n\nKeyin bu bo‘limni to‘liq qilamiz ✅",
      mainMenu
    );
  }

  if (text === "❓ Savol-javob") {
    return bot.sendMessage(chatId, "❓ Savol-javob bo‘limi. Savol tanlang:", faqMenu);
  }

  if (FAQ[text]) {
    return bot.sendMessage(chatId, "✅ " + FAQ[text], faqMenu);
  }

  if (text === "🧠 Test") {
    startQuiz(userId);
    return bot.sendMessage(chatId, `🧠 Test boshlandi!\nSavol:\n${QUIZ[0].q}`, mainMenu);
  }

  if (text === "💎 Premium") {
    return bot.sendMessage(
      chatId,
      "💎 Premium (info)\n\nPremium bo‘lsa:\n✅ Yopiq bo‘lim\n✅ Maxsus darslar\n✅ Tezkor yordam\n\nAdmin sizga premium yoqib beradi.",
      mainMenu
    );
  }

  if (text === "🔒 Premium bo‘lim") {
    if (!isPremium(userId) && !isAdmin(userId)) {
      return bot.sendMessage(
        chatId,
        `🔒 Bu bo‘lim faqat Premium uchun.\nPremium olish uchun adminga yozing: ${ADMIN_CONTACT}`,
        mainMenu
      );
    }
    return bot.sendMessage(
      chatId,
      "🔒 Premium bo‘lim (demo)\n✅ 1-dars: Premium intro\n✅ 2-dars: Botni kuchaytirish\n\nKeyin ko‘proq dars qo‘shamiz.",
      mainMenu
    );
  }

  if (text === "💰 Narxlar") {
    return bot.sendMessage(chatId, PRICES_TEXT, mainMenu);
  }

  if (text === "📢 Kanal") {
    return bot.sendMessage(chatId, `📢 Kanal: ${CHANNEL_LINK}`, mainMenu);
  }

  if (text === "👤 Admin") {
    if (!isAdmin(userId)) {
      return bot.sendMessage(chatId, `👤 Admin: ${ADMIN_CONTACT}`, mainMenu);
    }
    return bot.sendMessage(chatId, "🔧 Admin panel:", adminMenu);
  }

  if (text === "⚙️ Sozlamalar") {
    return bot.sendMessage(chatId, "⚙️ Sozlamalar (demo). Keyin til/notify qo‘shamiz.", mainMenu);
  }

  if (text === "ℹ️ Yordam") {
    return bot.sendMessage(
      chatId,
      "ℹ️ Yordam:\n/start — boshlash\n/menu — menu\n/myid — ID olish\n/resetmenu — menu reset\n\nTest: 🧠 Test tugmasi",
      mainMenu
    );
  }

  if (text === "⬅️ Orqaga (Menu)") {
    return bot.sendMessage(chatId, "📌 Menu:", mainMenu);
  }

  // ====== ADMIN PANEL BUTTONS ======
  if (isAdmin(userId) && text === "📣 Broadcast") {
    adminState[userId] = { mode: "broadcast" };
    return bot.sendMessage(chatId, "📣 Hamma userlarga yuboriladigan matnni yozing:", adminMenu);
  }

  if (isAdmin(userId) && text === "👥 Userlar soni") {
    const usersCount = Object.keys(db.users).length;
    const premiumCount = Object.keys(db.premium).length;
    const adminCount = Object.keys(db.admins).length;
    return bot.sendMessage(chatId, `👥 Userlar: ${usersCount}\n💎 Premium: ${premiumCount}\n👑 Admin: ${adminCount}`, adminMenu);
  }

  if (isAdmin(userId) && text === "➕ Premium qo‘shish") {
    adminState[userId] = { mode: "addPremium" };
    return bot.sendMessage(chatId, "➕ Premium beriladigan USER ID ni yuboring.\n(User /myid orqali oladi)", adminMenu);
  }

  if (isAdmin(userId) && text === "➖ Premium olib tashlash") {
    adminState[userId] = { mode: "removePremium" };
    return bot.sendMessage(chatId, "➖ Premium olib tashlanadigan USER ID ni yuboring:", adminMenu);
  }

  if (isAdmin(userId) && text === "➕ Admin qo‘shish") {
    adminState[userId] = { mode: "addAdmin" };
    return bot.sendMessage(chatId, "➕ Admin qilinadigan USER ID ni yuboring:", adminMenu);
  }

  if (isAdmin(userId) && text === "➖ Admin olib tashlash") {
    adminState[userId] = { mode: "removeAdmin" };
    return bot.sendMessage(chatId, "➖ Adminlikdan olinadigan USER ID ni yuboring:", adminMenu);
  }

  if (isAdmin(userId) && text === "📋 Premium ro‘yxat") {
    const list = Object.keys(db.premium);
    if (!list.length) return bot.sendMessage(chatId, "📋 Premium ro‘yxat bo‘sh.", adminMenu);
    return bot.sendMessage(chatId, "📋 Premium userlar:\n" + list.map((x) => "• " + x).join("\n"), adminMenu);
  }

  if (isAdmin(userId) && text === "📋 Admin ro‘yxat") {
    const list = Object.keys(db.admins);
    if (!list.length) return bot.sendMessage(chatId, "📋 Admin ro‘yxat bo‘sh.", adminMenu);
    return bot.sendMessage(chatId, "📋 Adminlar:\n" + list.map((x) => "• " + x).join("\n"), adminMenu);
  }

  if (text === "⬅️ Orqaga (Menu)") {
    return bot.sendMessage(chatId, "📌 Menu:", mainMenu);
  }

  // default
  return bot.sendMessage(chatId, "Menuni ishlating 👇", mainMenu);
});
bot.on("successful_payment", (msg) => {
  const userId = String(msg.from.id);
  db.premium[userId] = { addedAt: Date.now(), via: "telegram_payments" };
  saveDB(db);

  bot.sendMessage(msg.chat.id, "✅ To‘lov qabul qilindi! Premium yoqildi 🎉", mainMenu);
});

// ================== START SERVER + SET WEBHOOK ==================
app.listen(PORT, async () => {
  console.log("✅ Server ready on port", PORT);

  if (!PUBLIC_DOMAIN) {
    console.log("⚠️ RAILWAY_PUBLIC_DOMAIN topilmadi. Networking -> Generate Domain qiling.");
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
