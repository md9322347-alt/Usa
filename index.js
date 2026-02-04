// index.js
const { Telegraf } = require('telegraf');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const https = require('https');
const path = require('path');

const TOKEN = process.env.BOT_TOKEN || '8024603369:AAGI1dE8Hta4w3VYJGT6WBpibDEkRs-QVB0';
const bot = new Telegraf(TOKEN);

// ছবি ডাউনলোড
async function downloadPhoto(fileId) {
  return new Promise((resolve, reject) => {
    bot.telegram.getFile(fileId).then(file => {
      const url = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
      const fileName = path.join(__dirname, `temp_${Date.now()}.jpg`);
      
      const fileStream = fs.createWriteStream(fileName);
      https.get(url, res => {
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(fileName);
        });
      }).on('error', reject);
    }).catch(reject);
  });
}

// নাম্বার ক্লিন
function cleanPhoneNumber(raw) {
  const digits = raw.replace(/\D/g, '');
  
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (digits.length >= 10) return '+' + digits;
  
  return null;
}

// নাম্বার খুঁজে বের করা
function findPhoneNumbers(text) {
  const numbers = new Set();
  
  const patterns = [
    /\+\d{10,15}/g,
    /\d{10,15}/g,
    /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,
    /\(\d{3}\)\s?\d{3}[-.\s]?\d{4}/g
  ];
  
  patterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const cleaned = cleanPhoneNumber(match);
        if (cleaned && cleaned.replace(/\D/g, '').length >= 10) {
          numbers.add(cleaned);
        }
      });
    }
  });
  
  return Array.from(numbers).sort();
}

// ছবির মেসেজ হ্যান্ডল
bot.on('photo', async (ctx) => {
  let imagePath = null;
  
  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = photo.file_id;
    const originalMsgId = ctx.message.message_id;

    // ছবি ডাউনলোড
    imagePath = await downloadPhoto(fileId);
    
    // OCR
    const { data: { text } } = await Tesseract.recognize(
      imagePath,
      'eng',
      { logger: () => {} }
    );
    
    // নাম্বার খুঁজুন
    const phones = findPhoneNumbers(text);
    
    // টেম্প ফাইল ডিলিট
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    
    if (phones.length > 0) {
      // শুধু নাম্বার (লাইন বাই লাইন)
      const phoneText = phones.join('\n');
      
      // কপি বাটন
      const keyboard = {
        inline_keyboard: [[
          {
            text: "📋 কপি",
            callback_data: `copy_${Buffer.from(phoneText).toString('base64')}`
          }
        ]]
      };
      
      // শুধু নাম্বার পাঠানো (কোনো লেখা নেই)
      const sentMsg = await ctx.reply(phoneText, {
        reply_markup: keyboard
      });
      
      // ২ মিনিট পর ডিলিট
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(originalMsgId);
          await ctx.deleteMessage(sentMsg.message_id);
        } catch (e) {}
      }, 120000);
      
    } else {
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(originalMsgId);
        } catch (e) {}
      }, 120000);
    }
    
  } catch (err) {
    if (imagePath && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    
    setTimeout(async () => {
      try {
        await ctx.deleteMessage(ctx.message.message_id);
      } catch (e) {}
    }, 120000);
  }
});

// কপি বাটন হ্যান্ডল
bot.on('callback_query', async (ctx) => {
  try {
    if (ctx.callbackQuery.data.startsWith('copy_')) {
      await ctx.answerCbQuery('✅');
    }
  } catch (err) {
    try {
      await ctx.answerCbQuery('❌');
    } catch (e) {}
  }
});

// স্টার্ট মেসেজ (অপশনাল - সরিয়ে দিতে পারেন)
bot.start((ctx) => {
  ctx.reply('ছবি পাঠান।');
});

// বট চালু
bot.launch();

// শাটডাউন
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
