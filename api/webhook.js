const { Telegraf, Markup } = require('telegraf');
const { saveUser, getAllUsers, db } = require('../firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- ১. স্টার্ট কমান্ড (ইউজার যখন অ্যাড লিঙ্ক থেকে আসবে) ---
bot.start(async (ctx) => {
    const payload = ctx.startPayload;
    await saveUser(ctx.from);

    if (!payload) {
        return ctx.reply("স্বাগতম! ফাইল পেতে সঠিক লিংকে ক্লিক করে আসুন।");
    }

    // চ্যানেল জয়েন চেক
    try {
        const member = await ctx.telegram.getChatMember(process.env.CHANNEL_ID, ctx.from.id);
        const allowedStatus = ['member', 'administrator', 'creator'];
        
        if (!allowedStatus.includes(member.status)) {
            return ctx.reply("⚠️ ফাইলটি পেতে আগে আমাদের চ্যানেলে জয়েন করুন!", Markup.inlineKeyboard([
                [Markup.button.url("Join Channel", "https://t.me/+EGqcACu3kl0wYzA1")],
                [Markup.button.url("Try Again", `https://t.me/${ctx.botInfo.username}?start=${payload}`)]
            ]));
        }
    } catch (e) {
        return ctx.reply("বটকে চ্যানেলে Administrator হিসেবে অ্যাড করুন!");
    }

    // ফায়ারবেস থেকে ফাইল খুঁজে বের করা
    try {
        const doc = await db.collection('links').doc(payload).get();
        if (doc.exists) {
            const { message_id } = doc.data();
            await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, message_id);
        } else {
            ctx.reply("❌ ফাইলটি ডাটাবেজে পাওয়া যায়নি।");
        }
    } catch (err) {
        ctx.reply("সার্ভার ত্রুটি!");
    }
});

// --- ২. অটো-পোস্ট সিস্টেম (শুধুমাত্র ফাইল ও লিংক নিবে) ---
bot.on(['video', 'document', 'photo', 'text'], async (ctx) => {
    // এডমিন আইডি চেক
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;

    // যদি কমান্ড হয় (যেমন /broadcast) তবে ইগনোর করবে
    if (ctx.message.text && ctx.message.text.startsWith('/')) return;

    try {
        let hasLink = false;
        // চেক করবে টেক্সটের ভেতর কোনো URL আছে কি না
        if (ctx.message.text || ctx.message.caption) {
            const entities = ctx.message.entities || ctx.message.caption_entities || [];
            hasLink = entities.some(entity => entity.type === 'url' || entity.type === 'text_link');
        }

        // শুধুমাত্র ভিডিও, ফটো, ফাইল অথবা লিঙ্ক থাকলে প্রসেস করবে
        if (ctx.message.video || ctx.message.document || ctx.message.photo || hasLink) {
            
            // ১. চ্যানেলে কপি করো (এটি ক্যাপশন ছাড়া শুধু ফাইল পাঠাবে)
            const msg = await ctx.telegram.copyMessage(process.env.CHANNEL_ID, ctx.chat.id, ctx.message.message_id, {
                caption: "" // এখানে ক্যাপশন খালি করে দেওয়া হয়েছে যাতে টেক্সট না যায়
            });

            // ২. ইউনিক আইডি তৈরি
            const uniqueId = `dl_${Date.now().toString().slice(-7)}`;

            // ৩. ফায়ারবেসে সেভ
            await db.collection('links').doc(uniqueId).set({ 
                message_id: msg.message_id,
                created_at: new Date()
            });

            // ৪. অ্যাড লিঙ্ক জেনারেট
            const domain = process.env.VERCEL_URL || "moviefantasy.vercel.app";
            const adLink = `https://${domain}/?id=${uniqueId}`;

            ctx.reply(`✅ ফাইল/লিঙ্ক চ্যানেলে সেভ হয়েছে (ক্যাপশন ছাড়া)।\n\n🔗 অ্যাড লিঙ্ক:\n${adLink}`, {
                reply_to_message_id: ctx.message.message_id
            });
        }
    } catch (err) {
        console.error("Auto Post Error:", err);
    }
});

// --- ৩. ব্রডকাস্ট সিস্টেম ---
bot.command('broadcast', async (ctx) => {
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
    const text = ctx.message.text.split(' ').slice(1).join(' ');
    if (!text) return ctx.reply("ব্যবহার: /broadcast বার্তা");

    const users = await getAllUsers();
    let successCount = 0;
    for (const uid of users) {
        try {
            await ctx.telegram.sendMessage(uid, text);
            successCount++;
        } catch (e) {}
    }
    ctx.reply(`✅ ব্রডকাস্ট সম্পন্ন! মোট ${successCount} জন ইউজারকে পাঠানো হয়েছে।`);
});

module.exports = async (req, res) => {
    try {
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } else {
            res.status(200).send('Bot is Running...');
        }
    } catch (err) {
        res.status(500).send('Error');
    }
};
