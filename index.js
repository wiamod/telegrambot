const TelegramBot = require("node-telegram-bot-api");
const express = require("express");

const token = process.env.TOKEN;
if (!token) {
  console.error("❌ TOKEN yo‘q! Railway Variables ga TOKEN qo‘ying.");
  process.exit(1);
}

const app = express();
app.use(express.json());

const PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_PUBLIC_URL;
const PORT = process.env.PORT || 3000;

// ✅ Admin ID lar (o‘zingiznikini yozasiz)
const ADMIN_IDS = new Set([
  123456789 // <-- SHUNI o‘zingizning ID ga almashtiring
]);

// ====== DB (oddiy JSON fayl) ======
const fs = require("fs");
const DB_FILE = "./db.json";

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { users: {}, premium: {} };
  }
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
let db = loadDB();

function ensureUser(msg) {
  const id = String(msg.from.id);
  if (!db.users[id]) {
    db.users[id] = {
      id: msg.from.id,
      username: msg.from.username || "",
      first_name: msg.from.first_name || "",
      joinedAt: Date.now()
    };
    saveDB(db);
  }
}

function isAdmin(userId) {
  return ADMIN_IDS.has(Number(userId));
}
function isPremium(userId) {
  return !!db.premium[String(userId)];
}

// ====== Menular ======
const mainMenu = {
  reply_markup: {
    keyboard: [
      ["📚 Darslar", "❓ Savol-javob"],
      ["💎 Premium", "🔒 Premium bo‘lim"],
      ["📢 Kanal", "👤 Admin"],
      ["⚙️ Sozlamalar", "ℹ️ Yordam"]
    ],
    resize_keyboard: true
  }
};

const faqMenu = {
  reply_markup: {
    keyboard: [
      ["🤖 Bot nima?", "🧭 Qanday ishlaydi?"],
      ["💳 Premium nima?", "🆘 Muammo bo‘lsa?"],
      ["📌 Bot 24/7 ishlaydimi?", "💬 Savol berish"],
      ["⬅️ Orqaga (Menu)"]
    ],
    resize_keyboard: true
  }
};

const adminMenu = {
  reply_markup: {
    keyboard: [
      ["📣 Broadcast", "👥 Userlar soni"],
      ["➕ Premium qo‘shish", "➖ Premium olib tashlash"],
      ["📋 Premium ro‘yxat"],
      ["⬅️ Orqaga (Menu)"]
    ],
    resize_keyboard: true
  }
};

// ====== FAQ ======
const FAQ = {
  "🤖 Bot nima?": "Bu bot sizga darslar, savollar-javoblar va premium kontent bo‘yicha yordam beradi.",
  "🧭 Qanday ishlaydi?": "Menu tugmalaridan tanlang — bot avtomatik javob beradi.",
  "💳 Premium nima?": "Premium: yopiq darslar + maxsus funksiyalar. Keyin to‘lovni (Click/Payme) qo‘shamiz.",
  "🆘 Muammo bo‘lsa?": "Admin bilan bog‘laning: @Mirkomilallayorov01",
  "📌 Bot 24/7 ishlaydimi?": "Ha. Railway’da ishlasa — noutbuk o‘chiq bo‘lsa ham 24/7 ishlaydi.",
  "💬 Savol berish": "Savolingizni oddiy yozing, men javob beraman (demo)."
};

const CHANNEL_LINK = "https://t.me/your_channel"; // 🔁 o‘zingiznikiga almashtiring
const ADMIN_USERNAME = "@Mirkomilallayorov01";

// ====== Bot (webhook) ======
const bot = new TelegramBot(token);

function getWebhookUrl() {
  if (!PUBLIC_DOMAIN) return null;
  return `https://${PUBLIC_DOMAIN}/webhook`;
}

// ====== Express routes ======
app.get("/", (req, res) => res.send("Bot ishlayapti 🚀"));

app.post("/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/api/status", async (req, res) => {
  try {
    const me = await bot.getMe();
    res.json({ ok: true, username: me.username });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ====== Komandalar ======
bot.onText(/\/start/, (msg) => {
  ensureUser(msg);
  bot.sendMessage(msg.chat.id, "Salom! 👋\nMenu orqali tanlang:", mainMenu);
});

bot.onText(/\/menu/, (msg) => {
  ensureUser(msg);
  bot.sendMessage(msg.chat.id, "📌 Menu:", mainMenu);
});

// Admin ID ni bilish uchun
bot.onText(/\/myid/, (msg) => {
  bot.sendMessage(msg.chat.id, `Sizning ID: ${msg.from.id}`);
});

// ====== Admin “holat” (broadcast mode) ======
const adminState = {}; // { adminId: { mode: "broadcast"|"addPremium"|"removePremium" } }

// ====== Xabarlar ======
bot.on("message", async (msg) => {
  ensureUser(msg);

  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const userId = msg.from.id;

  // komandalarni qayta tutmaslik
  if (text === "/start" || text === "/menu" || text === "/myid") return;

  // ===== Admin mode ishlov berish =====
  if (isAdmin(userId) && adminState[userId]?.mode) {
    const mode = adminState[userId].mode;

    // Broadcast matn qabul qilish
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

    // Premium qo‘shish: ID yuboradi
    if (mode === "addPremium") {
      adminState[userId] = null;
      const target = text.replace(/\D/g, "");
      if (!target) return bot.sendMessage(chatId, "❌ ID topilmadi. Masalan: 123456789", adminMenu);

      db.premium[target] = { addedAt: Date.now() };
      saveDB(db);

      try { await bot.sendMessage(target, "🎉 Sizga Premium yoqildi! /start"); } catch {}
      return bot.sendMessage(chatId, `✅ Premium qo‘shildi: ${target}`, adminMenu);
    }

    // Premium olib tashlash
    if (mode === "removePremium") {
      adminState[userId] = null;
      const target = text.replace(/\D/g, "");
      if (!target) return bot.sendMessage(chatId, "❌ ID topilmadi. Masalan: 123456789", adminMenu);

      delete db.premium[target];
      saveDB(db);

      try { await bot.sendMessage(target, "ℹ️ Premium o‘chirildi."); } catch {}
      return bot.sendMessage(chatId, `✅ Premium olib tashlandi: ${target}`, adminMenu);
    }
  }

  // ===== Menu tugmalari =====
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

  if (text === "💎 Premium") {
    return bot.sendMessage(
      chatId,
      "💎 Premium (demo)\n\nPremium bo‘lsa:\n✅ Yopiq bo‘lim\n✅ Maxsus darslar\n✅ Tezkor yordam\n\nAdmin sizga premium yoqib beradi.",
      mainMenu
    );
  }

  if (text === "🔒 Premium bo‘lim") {
    if (!isPremium(userId) && !isAdmin(userId)) {
      return bot.sendMessage(chatId, "🔒 Bu bo‘lim faqat Premium uchun.\nPremium olish uchun adminga yozing: " + ADMIN_USERNAME, mainMenu);
    }
    return bot.sendMessage(
      chatId,
      "🔒 Premium bo‘lim (demo)\n✅ 1-dars: Premium intro\n✅ 2-dars: Botni kuchaytirish\n\nKeyin bu yerga ko‘proq dars qo‘shamiz.",
      mainMenu
    );
  }

  if (text === "📢 Kanal") {
    return bot.sendMessage(chatId, `📢 Kanal: ${CHANNEL_LINK}`, mainMenu);
  }

  if (text === "👤 Admin") {
    if (!isAdmin(userId)) {
      return bot.sendMessage(chatId, `👤 Admin: ${ADMIN_USERNAME}`, mainMenu);
    }
    return bot.sendMessage(chatId, "🔧 Admin panel:", adminMenu);
  }

  // ===== Admin panel tugmalari =====
  if (isAdmin(userId) && text === "📣 Broadcast") {
    adminState[userId] = { mode: "broadcast" };
    return bot.sendMessage(chatId, "📣 Hamma userlarga yuboriladigan matnni yozing:", adminMenu);
  }

  if (isAdmin(userId) && text === "👥 Userlar soni") {
    const count = Object.keys(db.users).length;
    const pcount = Object.keys(db.premium).length;
    return bot.sendMessage(chatId, `👥 Userlar: ${count}\n💎 Premium: ${pcount}`, adminMenu);
  }

  if (isAdmin(userId) && text === "➕ Premium qo‘shish") {
    adminState[userId] = { mode: "addPremium" };
    return bot.sendMessage(chatId, "➕ Premium beriladigan USER ID ni yuboring.\n(User /myid orqali ID oladi)", adminMenu);
  }

  if (isAdmin(userId) && text === "➖ Premium olib tashlash") {
    adminState[userId] = { mode: "removePremium" };
    return bot.sendMessage(chatId, "➖ Premium olib tashlanadigan USER ID ni yuboring:", adminMenu);
  }

  if (isAdmin(userId) && text === "📋 Premium ro‘yxat") {
    const list = Object.keys(db.premium);
    if (!list.length) return bot.sendMessage(chatId, "📋 Premium ro‘yxat bo‘sh.", adminMenu);
    return bot.sendMessage(chatId, "📋 Premium userlar:\n" + list.map((x) => "• " + x).join("\n"), adminMenu);
  }

  if (text === "⚙️ Sozlamalar") {
    return bot.sendMessage(chatId, "⚙️ Sozlamalar (demo). Keyin til/notify qo‘shamiz.", mainMenu);
  }

  if (text === "ℹ️ Yordam") {
    return bot.sendMessage(chatId, "ℹ️ Yordam:\n/start — boshlash\n/menu — menu\n/myid — ID olish", mainMenu);
  }

  if (text === "⬅️ Orqaga (Menu)") {
    return bot.sendMessage(chatId, "📌 Menu:", mainMenu);
  }

  // ===== Default =====
  return bot.sendMessage(chatId, "Menuni ishlating 👇", mainMenu);
});

// ====== Server + webhook ======
app.listen(PORT, async () => {
  console.log("✅ Server ready on port", PORT);

  const url = getWebhookUrl();
  if (!url) {
    console.log("⚠️ RAILWAY_PUBLIC_DOMAIN topilmadi. Networking -> Generate Domain qiling.");
    return;
  }

  try {
    await bot.setWebHook(url);
    console.log("✅ Webhook set:", url);
  } catch (e) {
    console.log("❌ Webhook set error:", e);
  }
});
