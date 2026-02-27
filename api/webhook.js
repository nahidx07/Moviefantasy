const { Telegraf, Markup } = require('telegraf');
const { saveUser, getAllUsers, db } = require('../firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// আপনার মেইন ডোমেইনটি এখানে সেট করা হয়েছে যাতে লিঙ্ক ছোট আসে
const MY_DOMAIN = "moviefantasy.vercel.app";

// --- ১. স্টার্ট কমান্ড হ্যান্ডলার ---
bot.start(async (ctx) => {
    const payload = ctx.startPayload;
    await saveUser(ctx.from);

    if (!payload) {
        return ctx.reply("স্বাগতম! ফাইল পেতে সঠিক অ্যাড লিংকে ক্লিক করে আমাদের বটে আসুন।");
    }

    // চ্যানেল জয়েন চেক
    try {
        const member = await ctx.telegram.getChatMember(process.env.CHANNEL_ID, ctx.from.id);
        const allowed = ['member', 'administrator', 'creator'];
        
        if (!allowed.includes(member.status)) {
            return ctx.reply("⚠️ ফাইলটি পেতে আগে আমাদের চ্যানেলে জয়েন করুন!", Markup.inlineKeyboard([
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
            // copyMessage ব্যবহার করলে সোর্স চ্যানেলের নাম দেখাবে না
            await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, message_id);
        } else {
            ctx.reply("❌ ফাইলটি ডাটাবেজে পাওয়া যায়নি। লিঙ্কটি হয়তো পুরনো।");
        }
    } catch (err) {
        ctx.reply("সার্ভার ত্রুটি! কিছুক্ষণ পর চেষ্টা করুন।");
    }
});

// --- ২. অটো-পোস্ট এবং লিঙ্ক জেনারেশন (এডমিন যখন ফাইল ফরওয়ার্ড করবে) ---
bot.on(['video', 'document', 'photo', 'text'], async (ctx) => {
    // শুধুমাত্র এডমিন আইডি চেক করবে
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;

    // কমান্ড হলে ইগনোর করবে
    if (ctx.message.text && ctx.message.text.startsWith('/')) return;

    try {
        let hasLink = false;
        // চেক করবে টেক্সটের ভেতর কোনো URL আছে কি না
        if (ctx.message.text || ctx.message.caption) {
            const entities = ctx.message.entities || ctx.message.caption_entities || [];
            hasLink = entities.some(e => e.type === 'url' || e.type === 'text_link');
        }

        // শুধুমাত্র ভিডিও, ফটো, ফাইল অথবা লিঙ্ক থাকলে প্রসেস করবে
        if (ctx.message.video || ctx.message.document || ctx.message.photo || hasLink) {
            
            // চ্যানেলে কপি করার সময় 'caption: ""' দেওয়া হয়েছে যাতে টেক্সট না যায়
            const msg = await ctx.telegram.copyMessage(process.env.CHANNEL_ID, ctx.chat.id, ctx.message.message_id, {
                caption: "" 
            });

            // ইউনিক আইডি জেনারেশন
            const uniqueId = `dl_${Date.now().toString().slice(-7)}`;

            // ফায়ারবেসে সেভ
            await db.collection('links').doc(uniqueId).set({ 
                message_id: msg.message_id,
                created_at: new Date()
            });

            // ফাইনাল অ্যাড লিঙ্ক (স্থায়ী ডোমেইন ব্যবহার করে)
            const adLink = `https://${MY_DOMAIN}/?id=${uniqueId}`;

            ctx.reply(`✅ ফাইল/লিঙ্ক চ্যানেলে সেভ হয়েছে (ক্যাপশন রিমুভ করা হয়েছে)।\n\n🔗 আপনার অ্যাড লিঙ্ক:\n${adLink}`, {
                reply_to_message_id: ctx.message.message_id
            });
        }
    } catch (err) {
        console.error("Auto Post Error:", err);
        ctx.reply("❌ এরর: বট কি চ্যানেলে অ্যাডমিন আছে?");
    }
});

// --- ৩. ব্রডকাস্ট কমান্ড ---
bot.command('broadcast', async (ctx) => {
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return ctx.reply("Not Authorized!");
    
    const text = ctx.message.text.split(' ').slice(1).join(' ');
    if (!text) return ctx.reply("ব্যবহার: /broadcast আপনার মেসেজ");

    const users = await getAllUsers();
    let successCount = 0;

    ctx.reply("📢 ব্রডকাস্ট শুরু হয়েছে...");
    
    for (const uid of users) {
        try {
            await ctx.telegram.sendMessage(uid, text);
            successCount++;
        } catch (e) {
            // ব্লকড ইউজারদের স্কিপ করবে
        }
    }
    ctx.reply(`✅ ব্রডকাস্ট সম্পন্ন! মোট ${successCount} জন ইউজার মেসেজ পেয়েছেন।`);
});

// Vercel Webhook Handler
module.exports = async (req, res) => {
    try {
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } else {
            res.status(200).send('Server is Online!');
        }
    } catch (err) {
        console.error("Webhook Error:", err);
        res.status(500).send('Internal Error');
    }
};
