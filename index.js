const { Telegraf } = require('telegraf');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const https = require('https');
const path = require('path');

const TOKEN = process.env.BOT_TOKEN || '8024603369:AAE4fyJYKH4JjbxidrT6a5dGjScc5o7gF34';
const bot = new Telegraf(TOKEN);

console.log('🤖 বট শুরু হচ্ছে...');

// ছবি ডাউনলোড
async function downloadPhoto(fileId) {
  return new Promise((resolve, reject) => {
    bot.telegram.getFile(fileId).then(file => {
      const url = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
      const fileName = `temp_${Date.now()}.jpg`;
      
      const fileStream = fs.createWriteStream(fileName);
      https.get(url, (response) => {
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(fileName);
        });
      }).on('error', (err) => {
        reject(err);
      });
    }).catch(reject);
  });
}

// Free OCR API ব্যবহার করব (Tesseract বাদ দিলাম)
async function extractTextFromImage(imagePath) {
  try {
    console.log('🔍 OCR API কল করছি...');
    
    // একটি ফ্রি OCR API ব্যবহার করছি
    const formData = new FormData();
    formData.append('file', fs.createReadStream(imagePath));
    
    const response = await axios.post('https://api.ocr.space/parse/image', formData, {
      headers: {
        ...formData.getHeaders(),
        'apikey': 'K81903095588957' // ফ্রি API key
      }
    });
    
    if (response.data && response.data.ParsedResults && response.data.ParsedResults[0]) {
      return response.data.ParsedResults[0].ParsedText;
    }
    return '';
  } catch (error) {
    console.error('OCR Error:', error.message);
    return '';
  }
}

// নাম্বার খুঁজে বের করা
function findPhoneNumbers(text) {
  if (!text) return [];
  
  const numbers = new Set();
  const patterns = [
    /\+?1?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
    /\d{10,15}/g,
    /\(\d{3}\)\s?\d{3}[-.\s]?\d{4}/g
  ];
  
  patterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => {
        // নাম্বার পরিষ্কার করা
        let cleaned = match.replace(/\D/g, '');
        if (cleaned.length === 10) cleaned = '+1' + cleaned;
        if (cleaned.length === 11 && cleaned.startsWith('1')) cleaned = '+' + cleaned;
        if (cleaned.length >= 10 && !cleaned.startsWith('+')) cleaned = '+' + cleaned;
        
        if (cleaned.length >= 11) {
          numbers.add(cleaned);
        }
      });
    }
  });
  
  return Array.from(numbers).sort();
}

// ফটো মেসেজ হ্যান্ডলার
bot.on('photo', async (ctx) => {
  console.log('📸 ছবি পেয়েছি');
  
  try {
    // "Processing..." মেসেজ
    const processingMsg = await ctx.reply('⏳ স্ক্যান হচ্ছে...');
    
    const originalMsgId = ctx.message.message_id;
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    
    // ছবি ডাউনলোড
    const imagePath = await downloadPhoto(photo.file_id);
    console.log('✅ ছবি ডাউনলোড সম্পন্ন');
    
    // OCR টেক্সট এক্সট্র্যাক্ট
    const extractedText = await extractTextFromImage(imagePath);
    console.log('📝 পাওয়া টেক্সট:', extractedText.substring(0, 100));
    
    // টেম্প ফাইল ডিলিট
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    
    // প্রসেসিং মেসেজ ডিলিট
    await ctx.deleteMessage(processingMsg.message_id);
    
    // নাম্বার খুঁজুন
    const phones = findPhoneNumbers(extractedText);
    console.log('📞 পাওয়া নাম্বার:', phones);
    
    if (phones.length > 0) {
      // শুধু নাম্বার
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
      
      // রেজাল্ট মেসেজ
      const resultMsg = await ctx.reply(phoneText, {
        reply_markup: keyboard
      });
      
      // ২ মিনিট পর সব মেসেজ ডিলিট
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(originalMsgId);
          await ctx.deleteMessage(resultMsg.message_id);
        } catch (e) {
          console.log('ডিলিট সমস্যা:', e.message);
        }
      }, 120000);
      
    } else {
      const noResultMsg = await ctx.reply('❌ কোনো নাম্বার পাওয়া যায়নি');
      
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(originalMsgId);
          await ctx.deleteMessage(noResultMsg.message_id);
        } catch (e) {}
      }, 120000);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    await ctx.reply('❌ সমস্যা হয়েছে, আবার চেষ্টা করুন');
    
    setTimeout(async () => {
      try {
        await ctx.deleteMessage(ctx.message.message_id);
      } catch (e) {}
    }, 120000);
  }
});

// কপি বাটন হ্যান্ডলার
bot.on('callback_query', async (ctx) => {
  try {
    if (ctx.callbackQuery.data.startsWith('copy_')) {
      await ctx.answerCbQuery('✅ কপি হয়েছে!');
    }
  } catch (error) {
    await ctx.answerCbQuery('❌ সমস্যা!');
  }
});

// স্টার্ট কমান্ড
bot.start((ctx) => {
  ctx.reply('ফোন নাম্বার থাকা ছবি পাঠান।');
});

// হেল্প
bot.help((ctx) => {
  ctx.reply('ছবি পাঠান, আমি স্ক্যান করব।');
});

// বট চালু
bot.launch()
  .then(() => {
    console.log('✅ বট চালু হয়েছে!');
    console.log('👉 বট ইউজারনেম:', bot.botInfo?.username);
  })
  .catch(err => {
    console.error('❌ বট চালু করতে ব্যর্থ:', err);
    process.exit(1);
  });

// পোর্ট লিসেন (Railway এর জন্য)
const PORT = process.env.PORT || 3000;
const server = require('http').createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running');
});

server.listen(PORT, () => {
  console.log(`🌐 সারভার চলছে পোর্ট ${PORT} তে`);
});

// শাটডাউন
process.once('SIGINT', () => {
  console.log('🛑 বট বন্ধ হচ্ছে...');
  bot.stop('SIGINT');
  server.close();
});

process.once('SIGTERM', () => {
  console.log('🛑 বট বন্ধ হচ্ছে...');
  bot.stop('SIGTERM');
  server.close();
});
