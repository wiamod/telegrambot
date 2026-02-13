const TelegramBot = require("node-telegram-bot-api");
const express = require("express");

const app = express();
app.use(express.json());

const token = process.env.TOKEN;
if (!token) throw new Error("TOKEN topilmadi (Railway Variables ga TOKEN qo'yilganini tekshir)");

const bot = new TelegramBot(token);

// Railway public domenini olamiz
const domain =
  process.env.RAILWAY_PUBLIC_DOMAIN ||
  (process.env.RAILWAY_STATIC_URL ? process.env.RAILWAY_STATIC_URL.replace("https://", "") : null);

if (!domain) {
  console.log("RAILWAY_PUBLIC_DOMAIN topilmadi. Networking -> Generate Domain qilinganini tekshir.");
}

// Webhook yo'li (senda hozir shunaqa)
const webhookPath = `/bot${token}`;
if (domain) {
  bot.setWebHook(`https://${domain}${webhookPath}`);
}

// Telegram webhook update keladigan endpoint
app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Oddiy tekshiruv sahifa
app.get("/", (req, res) => res.send("Bot ishlayapti 🚀"));

// /start -> tugmalar
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, "Salom Mirkomil! Menyudan tanlang 👇", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📌 Menyu", callback_data: "MENU" }],
        [{ text: "❓ Savol-javob", callback_data: "QA" }],
        [{ text: "💰 Pullik (demo)", callback_data: "PAID_DEMO" }],
      ],
    },
  });
});

// Tugma bosilganda ishlaydi
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  // Telegramda "loading..." turib qolmasin:
  await bot.answerCallbackQuery(q.id);

  if (data === "MENU") {
    return bot.sendMessage(chatId, "📌 Menyu:\n1) /start\n2) /savol");
  }

  if (data === "QA") {
    return bot.sendMessage(chatId, "Savol-javob rejimi ✅\nSavolingni yoz: masalan: 'JS nima?'");
  }

  if (data === "PAID_DEMO") {
    return bot.sendMessage(
      chatId,
      "💰 Pullik (demo)\nHozircha demo. Keyin haqiqiy to'lov (Telegram Payments) ni ulaymiz."
    );
  }
});

// Savol yozsa (oddiy demo javob)
bot.on("message", (msg) => {
  const text = (msg.text || "").toLowerCase();
  const chatId = msg.chat.id;

  // /start ni qayta ishlatib yubormaslik uchun:
  if (text.startsWith("/")) return;

  // Mini-demo Q/A:
  if (text.includes("js") || text.includes("javascript")) {
    return bot.sendMessage(chatId, "JavaScript — web uchun dasturlash tili ✅");
  }

  // Default javob:
  return bot.sendMessage(chatId, "Tushundim 🙂 Tugmalardan foydalan yoki savolingni aniqroq yoz.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log("Server ready on port " + PORT));
