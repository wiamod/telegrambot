const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(process.env.TOKEN, { polling: true });

app.get('/', (req, res) => {
  res.send('Bot ishlayapti 🚀');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('Server ready');
});

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Salom! Railwayda 24/7 ishlayapman 🚀');
});
