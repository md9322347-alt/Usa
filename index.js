// index.js
const { Telegraf } = require('telegraf');
const Tesseract = require('tesseract.js');
const { parsePhoneNumber } = require('libphonenumber-js');
const fs = require('fs');
const https = require('https');
const path = require('path');

// টোকেন
const TOKEN = process.env.BOT_TOKEN || '8024603369:AAENjMG8JIEzu0cSJM097-dChjNHxcmANyk';
const bot = new Telegraf(TOKEN);

console.log('🤖 বট শুরু হচ্ছে...');

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
          resolve(fileName);
        });
        fileStream.on('error', reject);
      }).on('error', reject);
    }).catch(reject);
  });
}

// নাম্বার ক্লিন
function cleanPhoneNumber(raw) {
  try {
    let digits = raw.replace(/\D/g, '');
    
    if (digits.length === 10) {
      return '+1' + digits;
    }
    
    if (digits.length === 11 && digits.startsWith('1')) {
      return '+' + digits;
    }
    
    if (!digits.startsWith('+')) {
      return '+' + digits;
    }
    
    return digits;
  } catch (e) {
    return raw.replace(/\D/g, '');
  }
}

// নাম্বার খুঁজে বের করা
function findPhoneNumbers(text) {
  const numbers = [];
  
  const phonePatterns = [
    /\+\d{10,15}/g,
    /\d{10,15}/g,
    /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,
    /\(\d{3}\)\s?\d{3}[-.\s]?\d{4}/g
  ];
  
  for (const pattern of phonePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const cleaned = cleanPhoneNumber(match);
        if (cleaned.replace(/\D/g, '').length >= 10) {
          numbers.push(cleaned);
        }
      });
    }
  }
  
  return [...new Set(numbers)].sort();
}

bot.on('photo', async (ctx) => {
  try {
    const messageId = ctx.message.message_id;
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = photo.file_id;

    // ছবি ডাউনলোড
    const imagePath = await downloadPhoto(fileId);
    
    // OCR
    const result = await Tesseract.recognize(
      imagePath,
      'eng',
      { logger: m => {} }
    );

    const extractedText = result.data.text;
    
    // ফোন নাম্বার খুঁজে বের করা
    const phones = findPhoneNumbers(extractedText);
    
    // টেম্প ফাইল ডিলিট
    fs.unlinkSync(imagePath);

    if (phones.length > 0) {
      // শুধু নাম্বারগুলো (লাইন বাই লাইন)
      const phoneListText = phones.join('\n');
      
      // শুধু একটি "কপি" বাটন
      const keyboard = {
        inline_keyboard: [[
          {
            text: "📋 কপি",
            callback_data: `copy_${Buffer.from(phoneListText).toString('base64')}`
          }
        ]]
      };
      
      // শুধু নাম্বার পাঠানো (কোনো এক্সট্রা টেক্সট নেই)
      const sentMsg = await ctx.reply(
        phoneListText,
        {
          reply_markup: keyboard
        }
      );

      // ২ মিনিট পর মেসেজ ডিলিট
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(messageId);
          await ctx.deleteMessage(sentMsg.message_id);
        } catch (e) {}
      }, 120 * 1000);
      
    } else {
      // কোনো নাম্বার না পেলে শুধু ডিলিট
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(messageId);
        } catch (e) {}
      }, 120 * 1000);
    }

  } catch (err) {
    console.error('Error:', err);
    setTimeout(async () => {
      try {
        await ctx.deleteMessage(ctx.message.message_id);
      } catch (e) {}
    }, 120 * 1000);
  }
});

// কপি বাটন হ্যান্ডলার
bot.on('callback_query', async (ctx) => {
  try {
    const callbackData = ctx.callbackQuery.data;
    
    if (callbackData.startsWith('copy_')) {
      const encodedText = callbackData.replace('copy_', '');
      const phoneListText = Buffer.from(encodedText, 'base64').toString('utf-8');
      
      // শুধু কনফার্মেশন (কোনো মেসেজ পাঠানো হবে না)
      await ctx.answerCbQuery('✅ কপি হয়েছে!');
    }
  } catch (err) {
    try {
      await ctx.answerCbQuery('❌ সমস্যা হয়েছে!');
    } catch (e) {}
  }
});

// স্টার্ট কমান্ড - শুধু একটি সরল বার্তা
bot.start((ctx) => {
  ctx.reply(
    'ছবি পাঠান, নাম্বার দেব।'
  );
});

// হেল্প কমান্ড
bot.help((ctx) => {
  ctx.reply(
    'ছবিতে ফোন নাম্বার থাকলে, সেটা স্ক্যান করে দেব।'
  );
});

// বট লঞ্চ
bot.launch()
  .then(() => {
    console.log('✅ বট চালু হয়েছে!');
  })
  .catch(err => {
    console.error('❌ বট চালু করতে সমস্যা:', err);
    process.exit(1);
  });

// গ্রেসফুল শাটডাউন
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
