const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const app = express();

const token = process.env.TOKEN;
const bot = new TelegramBot(token);

const PORT = process.env.PORT || 3000;
const url = process.env.RAILWAY_PUBLIC_DOMAIN;

bot.setWebHook(`https://${url}/bot${token}`);

app.use(express.json());

app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send('Bot ishlayapti 🚀');
});


// =======================
// 🔥 TUGMALAR MENUSI
// =======================

const menu = {
  reply_markup: {
    keyboard: [
      ['📚 Darslar', '❓ Savollar'],
      ['💰 Premium', '📞 Aloqa']
    ],
    resize_keyboard: true
  }
};


// /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Salom Mirkomil 👋\nKerakli bo‘limni tanlang:",
    menu
  );
});


// =======================
// 🔥 SAVOL JAVOBLAR
// =======================

bot.on('message', (msg) => {
  const text = msg.text;

  if (text === '📚 Darslar') {
    bot.sendMessage(msg.chat.id,
      "📚 Darslar:\n\n1️⃣ HTML\n2️⃣ CSS\n3️⃣ JavaScript\n4️⃣ NodeJS");
  }

  else if (text === '❓ Savollar') {
    bot.sendMessage(msg.chat.id,
      "❓ Ko‘p beriladigan savollar:\n\n👉 Bot 24/7 ishlaydi\n👉 Telefon o‘chiq bo‘lsa ham ishlaydi\n👉 Railway serverda turadi");
  }

  else if (text === '💰 Premium') {
    bot.sendMessage(msg.chat.id,
      "💎 Premium tez orada qo‘shiladi!\nPullik darslar + maxsus funksiyalar bo‘ladi.");
  }

  else if (text === '📞 Aloqa') {
    bot.sendMessage(msg.chat.id,
      "📞 Admin: @username");
  }
});


app.listen(PORT, () => console.log('Server ready 🚀'));
