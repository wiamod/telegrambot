const TelegramBot = require("node-telegram-bot-api");
const express = require("express");

const token = process.env.TOKEN;
if (!token) {
  console.error("❌ TOKEN yo‘q! Railway Variables ga TOKEN qo‘ying.");
  process.exit(1);
}

const app = express();
app.use(express.json());

// Railway public domain (Generate Domain qilgan bo‘lsang shu chiqadi)
const PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_PUBLIC_URL;
const PORT = process.env.PORT || 3000;

// === 1) Tugmalar (Menu) ===
const mainMenu = {
  reply_markup: {
    keyboard: [
      ["📚 Darslar", "❓ Savol-javob"],
      ["💎 Premium", "📢 Kanal"],
      ["👤 Admin", "⚙️ Sozlamalar"],
      ["ℹ️ Yordam"]
    ],
    resize_keyboard: true
  }
};

// === 2) FAQ (Savol-javob) tugmalari ===
const faqMenu = {
  reply_markup: {
    keyboard: [
      ["🤖 Bot nima?", "🧭 Qanday ishlaydi?"],
      ["💳 Premium nima?", "🆘 Muammo bo‘lsa?"],
      ["⬅️ Orqaga (Menu)"]
    ],
    resize_keyboard: true
  }
};

// FAQ javoblar
const FAQ = {
  "🤖 Bot nima?": "Bu bot sizga darslar, savollar va premium kontent bo‘yicha yordam beradi.",
  "🧭 Qanday ishlaydi?": "Menu tugmalaridan tanlang. Bot avtomatik javob beradi. 24/7 Railway’da ishlaydi.",
  "💳 Premium nima?": "Premium bo‘lsa maxsus darslar + yopiq funksiyalar ochiladi. (Hozircha demo, keyin to‘lov qo‘shamiz.)",
  "🆘 Muammo bo‘lsa?": "Admin bo‘limiga kiring yoki menga yozing: @Mirkomilallayorov01"
};

const CHANNEL_LINK = "https://t.me/your_channel"; // 🔁 kanal linkini o‘zingnikiga almashtir
const ADMIN_USERNAME = "@Mirkomilallayorov01";

// Bot yaratish (webhook rejimda)
const bot = new TelegramBot(token);

// Webhook url tayyorlash
function getWebhookUrl() {
  if (!PUBLIC_DOMAIN) return null;
  // ⚠️ URL tokenni oshkor qilmasligi uchun maxfiy yo‘l ishlatamiz
  return `https://${PUBLIC_DOMAIN}/webhook`;
}

// === Express routes ===
app.get("/", (req, res) => res.send("Bot ishlayapti 🚀"));

app.post("/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Status tekshiruv (brauzerda ochib tekshirsa bo‘ladi)
app.get("/api/status", async (req, res) => {
  try {
    const me = await bot.getMe();
    res.json({ ok: true, username: me.username });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// === 3) Komandalar ===
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Salom Mirkomil! 👋\nMenu orqali tanlang:",
    mainMenu
  );
});

bot.onText(/\/menu/, (msg) => {
  bot.sendMessage(msg.chat.id, "📌 Menu:", mainMenu);
});

// === 4) Tugmalarni boshqarish ===
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  // /start yuqorida bor — yana qayta ishlatmaslik uchun
  if (text === "/start" || text === "/menu") return;

  // Menu tugmalari
  if (text === "📚 Darslar") {
    return bot.sendMessage(
      chatId,
      "📚 Darslar bo‘limi (demo)\n1) JavaScript\n2) Node.js\n3) Telegram Bot\n\nKeyin bu yerga darslarni to‘liq qo‘shamiz ✅",
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
      "💎 Premium (demo)\n\nPremium bo‘lsa:\n✅ Maxsus darslar\n✅ Yopiq bo‘limlar\n✅ Tezkor yordam\n\nKeyingi bosqichda to‘lov (Click/Payme) qo‘shamiz 💰",
      mainMenu
    );
  }

  if (text === "📢 Kanal") {
    return bot.sendMessage(chatId, `📢 Kanalimiz: ${CHANNEL_LINK}`, mainMenu);
  }

  if (text === "👤 Admin") {
    return bot.sendMessage(chatId, `👤 Admin: ${ADMIN_USERNAME}`, mainMenu);
  }

  if (text === "⚙️ Sozlamalar") {
    return bot.sendMessage(chatId, "⚙️ Sozlamalar (demo)\nKeyin til/tema/notify qo‘shamiz.", mainMenu);
  }

  if (text === "ℹ️ Yordam") {
    return bot.sendMessage(chatId, "ℹ️ Yordam:\n/menu — menuni ochish\n/start — qayta boshlash", mainMenu);
  }

  if (text === "⬅️ Orqaga (Menu)") {
    return bot.sendMessage(chatId, "📌 Menu:", mainMenu);
  }

  // Boshqa matnlar
  return bot.sendMessage(chatId, "Menuni ishlating 👇", mainMenu);
});

// === 5) Server start + webhook set ===
app.listen(PORT, async () => {
  console.log("✅ Server ready on port", PORT);

  const url = getWebhookUrl();
  if (!url) {
    console.log("⚠️ RAILWAY_PUBLIC_DOMAIN topilmadi. Networking -> Generate Domain qiling.");
    console.log("⚠️ Hozir webhook o‘rnatilmadi.");
    return;
  }

  try {
    await bot.setWebHook(url);
    console.log("✅ Webhook set:", url);
  } catch (e) {
    console.log("❌ Webhook set error:", e);
  }
});
