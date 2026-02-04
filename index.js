// index.js
const { Telegraf } = require('telegraf');
const Tesseract = require('tesseract.js');
const { parsePhoneNumber } = require('libphonenumber-js');
const fs = require('fs');
const https = require('https');
const path = require('path');

const TOKEN = '8024603369:AAFq34YpyDkuJ5UYmhptqOD9tYRD2WEQ5E0';
const bot = new Telegraf(TOKEN);

// ছবি ডাউনলোড
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

// নাম্বার ক্লিন করে +1... ফরম্যাটে আনা
function cleanPhoneNumber(raw) {
  try {
    let phone = parsePhoneNumber(raw);
    if (!phone) {
      // যদি parse না হয়, ম্যানুয়ালি চেষ্টা করি
      let digits = raw.replace(/\D/g, '');
      if (digits.startsWith('1') && digits.length === 11) {
        digits = '+' + digits;
      } else if (digits.length === 10) {
        digits = '+1' + digits;
      } else if (!digits.startsWith('+')) {
        digits = '+' + digits;
      }
      phone = parsePhoneNumber(digits);
    }
    
    if (phone && phone.isValid()) {
      // শুধু + আর ডিজিট, কোনো স্পেস/ড্যাশ/প্যারেন্থেসিস নাই
      return phone.number;  // এটা +16024973298 এরকম দেয়
    }
    
    // যদি libphonenumber কাজ না করে তবুও ক্লিন করে দেই
    let cleaned = raw.replace(/\D/g, '');
    if (cleaned.length === 10) cleaned = '1' + cleaned;
    if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
    return cleaned;
  } catch (e) {
    let cleaned = raw.replace(/\D/g, '');
    if (cleaned.length === 10) cleaned = '1' + cleaned;
    if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
    return cleaned;
  }
}

function findPhoneNumbers(text) {
  const numbers = [];
  const phoneRegex = /[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}/g;
  
  let match;
  while ((match = phoneRegex.exec(text)) !== null) {
    const raw = match[0];
    const cleaned = cleanPhoneNumber(raw);
    if (cleaned.length >= 10 && cleaned.startsWith('+')) {
      numbers.push(cleaned);
    }
  }
  
  // ডুপ্লিকেট রিমুভ + সর্ট (ঐচ্ছিক)
  return [...new Set(numbers)].sort();
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
      // সবগুলো এক মেসেজে, এক লাইনে একটা করে, monospace
      const textToSend = phones.map(n => '`' + n + '`').join('\n');
      
      const sentMsg = await ctx.reply(textToSend, {
        parse_mode: 'MarkdownV2'
      });

      // ২ মিনিট পর দুইটা মেসেজই মুছে ফেলা
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
  .then(() => console.log('🤖 Bot চালু 🔥'))
  .catch(err => console.error('Launch error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
