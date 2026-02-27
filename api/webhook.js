const { Telegraf, Markup } = require('telegraf');
const { saveUser, getAllUsers, db } = require('../firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- ১. স্টার্ট কমান্ড এবং ডিপ লিঙ্ক হ্যান্ডলার ---
bot.start(async (ctx) => {
    const payload = ctx.startPayload;
    await saveUser(ctx.from);

    if (!payload) {
        return ctx.reply("স্বাগতম! আমাদের বটের মাধ্যমে ফাইল পেতে লিংকে ক্লিক করে আসুন।");
    }

    // চ্যানেল জয়েন চেক
    try {
        const member = await ctx.telegram.getChatMember(process.env.CHANNEL_ID, ctx.from.id);
        const allowed = ['member', 'administrator', 'creator'];
        if (!allowed.includes(member.status)) {
            return ctx.reply("⚠️ ভিডিওটি পেতে আগে আমাদের চ্যানেলে জয়েন করুন!", Markup.inlineKeyboard([
                [Markup.button.url("Join Channel", "https://t.me/+EGqcACu3kl0wYzA1")],
                [Markup.button.url("Try Again", `https://t.me/${ctx.botInfo.username}?start=${payload}`)]
            ]));
        }
    } catch (e) {
        return ctx.reply("বটকে চ্যানেলে Administrator হিসেবে অ্যাড করুন!");
    }

    // ফায়ারবেস থেকে ফাইল খুঁজে পাঠানো
    try {
        const doc = await db.collection('links').doc(payload).get();
        if (doc.exists) {
            const { message_id } = doc.data();
            // Forward না করে Copy করা হচ্ছে (যাতে সোর্স চ্যানেলের নাম না দেখায়)
            await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, message_id);
        } else {
            ctx.reply("❌ দুঃখিত! ফাইলটি আমাদের ডাটাবেজে নেই।");
        }
    } catch (err) {
        ctx.reply("সার্ভার ত্রুটি! কিছুক্ষণ পর চেষ্টা করুন।");
    }
});

// --- ২. অটো-পোস্ট এবং লিংক জেনারেশন (এডমিন অনলি) ---
bot.on(['video', 'document', 'photo', 'audio', 'text'], async (ctx) => {
    // শুধুমাত্র এডমিন থেকে ফাইল রিসিভ করবে
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;

    // কমান্ড হলে ইগনোর করবে (যেমন /broadcast)
    if (ctx.message.text && ctx.message.text.startsWith('/')) return;

    try {
        // চ্যানেলে ফাইলটি পাঠিয়ে দেওয়া হচ্ছে
        const msg = await ctx.telegram.copyMessage(process.env.CHANNEL_ID, ctx.chat.id, ctx.message.message_id);
        
        // ইউনিক আইডি তৈরি (যাতে লিংকে ব্যবহার করা যায়)
        const uniqueId = `dl_${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;

        // ফায়ারবেসে মেসেজ আইডি সেভ
        await db.collection('links').doc(uniqueId).set({ 
            message_id: msg.message_id,
            timestamp: new Date()
        });

        // অ্যাড লিংক তৈরি (Vercel URL ব্যবহার করে)
        const adLink = `https://${process.env.VERCEL_URL}/?id=${uniqueId}`;

        ctx.reply(`✅ ফাইলটি চ্যানেলে সেভ হয়েছে।\n\n🔗 ইউজারদের জন্য আপনার অ্যাড লিংক:\n${adLink}`, {
            reply_to_message_id: ctx.message.message_id
        });

    } catch (err) {
        console.error("Upload Error:", err);
        ctx.reply("❌ চ্যানেলে পাঠাতে ব্যর্থ! বটকে চ্যানেলে এডমিন করেছেন তো?");
    }
});

// --- ৩. ব্রডকাস্ট সিস্টেম ---
bot.command('broadcast', async (ctx) => {
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return ctx.reply("Not Authorized!");
    
    const text = ctx.message.text.split(' ').slice(1).join(' ');
    if (!text) return ctx.reply("ব্যবহার: /broadcast আপনার মেসেজ");

    const users = await getAllUsers();
    let count = 0;

    ctx.reply("📢 ব্রডকাস্টিং শুরু হয়েছে...");
    
    for (const uid of users) {
        try {
            await ctx.telegram.sendMessage(uid, text);
            count++;
        } catch (e) {
            // ব্লক করা ইউজারদের ইগনোর করবে
        }
    }
    ctx.reply(`✅ ব্রডকাস্ট সম্পন্ন! মোট ${count} জন ইউজার মেসেজ পেয়েছেন।`);
});

// Vercel Webhook Handler
module.exports = async (req, res) => {
    try {
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } else {
            res.status(200).send('Bot is working fine!');
        }
    } catch (err) {
        console.error("Webhook Handler Error:", err);
        res.status(500).send('Internal Error');
    }
};
