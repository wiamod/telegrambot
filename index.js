const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const app = express();

const token = process.env.TOKEN;
const bot = new TelegramBot(token);

const PORT = process.env.PORT || 3000;
const url = process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN;

// webhook
bot.setWebHook(`https://${url}/bot${token}`);

app.use(express.json());

app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send('Bot ishlayapti 🚀');
});

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Salom! Railwayda 24/7 ishlayapman 🚀');
});

app.listen(PORT, () => console.log('Server ready'));
