// index.js
const { Telegraf } = require('telegraf');
const Tesseract = require('tesseract.js');
const { parsePhoneNumber } = require('libphonenumber-js');
const fs = require('fs');
const https = require('https');
const path = require('path');

const TOKEN = '8024603369:AAFVuizylkUosVhtYHTweRk8VGkZwFsMNWw';
const bot = new Telegraf(TOKEN);

// ছবি ডাউনলোড করার ফাংশন
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

// টেক্সট থেকে ফোন নাম্বার বের করা
function findPhoneNumbers(text) {
  const numbers = [];
  const phoneRegex = /[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}/g;
  
  let match;
  while ((match = phoneRegex.exec(text)) !== null) {
    const raw = match[0];
    try {
      const phone = parsePhoneNumber(raw);
      if (phone && phone.isValid()) {
        numbers.push(phone.formatInternational());
      } else {
        // যদি parse না হয় তবুও রাখি (কিছু ক্ষেত্রে আন্তর্জাতিক ফরম্যাট ছাড়া থাকে)
        numbers.push(raw);
      }
    } catch (e) {
      // যদি libphonenumber ভাঙে তবুও রাখি
      numbers.push(raw);
    }
  }
  
  // ডুপ্লিকেট রিমুভ
  return [...new Set(numbers)];
}

bot.on('photo', async (ctx) => {
  try {
    const messageId = ctx.message.message_id;
    const photo = ctx.message.photo.pop(); // সবচেয়ে বড় সাইজের ছবি
    const fileId = photo.file_id;

    // ছবি ডাউনলোড
    const imagePath = await downloadPhoto(fileId);

    // OCR দিয়ে টেক্সট বের করা
    const { data: { text } } = await Tesseract.recognize(
      imagePath,
      'eng',
      { logger: m => console.log(m) }
    );

    // ফোন নাম্বার খুঁজে বের করা
    const phones = findPhoneNumbers(text);

    // ফাইল মুছে ফেলা
    fs.unlink(imagePath, () => {});

    // যদি কোনো নাম্বার পাওয়া যায়
    if (phones.length > 0) {
      const textToSend = phones.map(n => '`' + n + '`').join('\n');
      
      const sentMsg = await ctx.reply(textToSend, {
        parse_mode: 'MarkdownV2',
        reply_to_message_id: messageId
      });

      // ২ মিনিট পর মুছে ফেলা
      setTimeout(() => {
        ctx.deleteMessage(messageId).catch(() => {});
        ctx.deleteMessage(sentMsg.message_id).catch(() => {});
      }, 120 * 1000);
    }
    // নাম্বার না পেলে কিছু না বলা + ২ মিনিট পর ইউজারের মেসেজ মুছে ফেলা
    else {
      setTimeout(() => {
        ctx.deleteMessage(messageId).catch(() => {});
      }, 120 * 1000);
    }

  } catch (err) {
    console.error('Error:', err);
    // এরর হলেও ২ মিনিট পর মেসেজ মুছে ফেলার চেষ্টা
    setTimeout(() => {
      ctx.deleteMessage(ctx.message.message_id).catch(() => {});
    }, 120 * 1000);
  }
});

// বট চালু
bot.launch()
  .then(() => console.log('🤖 Bot চালু হয়েছে 🔥'))
  .catch(err => console.error('Launch error:', err));

// graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
