// index.js

const { Telegraf } = require('telegraf');
const Tesseract = require('tesseract.js');
const { parsePhoneNumber } = require('libphonenumber-js');
const fs = require('fs');
const https = require('https');
const path = require('path');

const TOKEN = '8024603369:AAHK7DCtOCzB1wKzLAzANnUs9SNaYeBNptE';
const bot = new Telegraf(TOKEN);

function downloadPhoto(fileId) {
  return new Promise((resolve, reject) => {
    bot.telegram.getFile(fileId).then(file => {
      const url = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
      const fileName = path.join(__dirname, `photo_${Date.now()}.jpg`);

      const fileStream = fs.createWriteStream(fileName);
      https.get(url, res => {
        res.pipe(fileStream);
        fileStream.on('finish', () => resolve(fileName));
        fileStream.on('error', reject);
      }).on('error', reject);
    }).catch(reject);
  });
}

function cleanPhoneNumber(raw) {
  try {
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 10) digits = '1' + digits;
    if (!digits.startsWith('+')) digits = '+' + digits;

    const phone = parsePhoneNumber(digits);
    if (phone && phone.isValid()) {
      return phone.number;
    }
    return digits;
  } catch (e) {
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 10) digits = '1' + digits;
    if (!digits.startsWith('+')) digits = '+' + digits;
    return digits;
  }
}

function findPhoneNumbers(text) {
  const numbers = [];
  const phoneRegex = /[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}/g;

  let match;
  while ((match = phoneRegex.exec(text)) !== null) {
    const raw = match[0];
    const cleaned = cleanPhoneNumber(raw);
    if (cleaned.length >= 11 && cleaned.startsWith('+')) {
      numbers.push(cleaned);
    }
  }

  return [...new Set(numbers)];
}

bot.on('photo', async (ctx) => {
  try {
    const messageId = ctx.message.message_id;
    const photo = ctx.message.photo.pop();
    const fileId = photo.file_id;

    const imagePath = await downloadPhoto(fileId);

    const { data: { text } } = await Tesseract.recognize(
      imagePath,
      'eng',
      { logger: m => console.log(m) }
    );

    const phones = findPhoneNumbers(text);

    fs.unlink(imagePath, () => {});

    if (phones.length > 0) {
      // সব নাম্বার এক লাইনে, কমা দিয়ে আলাদা — কোনো markdown নাই
      const numbersText = phones.join(',  ');

      const sentMsg = await ctx.reply(numbersText);

      // ২ মিনিট পর ডিলিট
      setTimeout(() => {
        ctx.deleteMessage(messageId).catch(() => {});
        ctx.deleteMessage(sentMsg.message_id).catch(() => {});
      }, 120 * 1000);
    } else {
      setTimeout(() => {
        ctx.deleteMessage(messageId).catch(() => {});
      }, 120 * 1000);
    }

  } catch (err) {
    console.error('Error:', err);
    setTimeout(() => {
      ctx.deleteMessage(ctx.message.message_id).catch(() => {});
    }, 120 * 1000);
  }
});

bot.launch()
  .then(() => console.log('🤖 Bot চালু আছে 🔥'))
  .catch(err => console.error('Launch error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
