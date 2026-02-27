const { Telegraf, Markup } = require('telegraf');
const { saveUser, getAllUsers, db } = require('../firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start(async (ctx) => {
    const payload = ctx.startPayload;
    await saveUser(ctx.from);

    if (!payload) {
        return ctx.reply("স্বাগতম! ভিডিও পেতে সঠিক লিঙ্ক ব্যবহার করুন।");
    }

    // Join Check Logic for Private Channel
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

    // File Delivery
    try {
        const doc = await db.collection('links').doc(payload).get();
        if (doc.exists) {
            const { message_id } = doc.data();
            await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, message_id);
        } else {
            ctx.reply("❌ ফাইলটি খুঁজে পাওয়া যায়নি।");
        }
    } catch (err) {
        ctx.reply("সার্ভার এরর!");
    }
});

// Admin Upload
bot.on(['video', 'document'], async (ctx) => {
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
    try {
        const msg = await ctx.telegram.copyMessage(process.env.CHANNEL_ID, ctx.chat.id, ctx.message.message_id);
        const uniqueId = `vid_${Date.now()}`;
        await db.collection('links').doc(uniqueId).set({ message_id: msg.message_id });
        const adLink = `https://${process.env.VERCEL_URL}/?id=${uniqueId}`;
        ctx.reply(`✅ লিঙ্ক তৈরি হয়েছে:\n${adLink}`);
    } catch (err) {
        ctx.reply("আপলোড ব্যর্থ হয়েছে।");
    }
});

// Admin Broadcast
bot.command('broadcast', async (ctx) => {
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
    const text = ctx.message.text.split(' ').slice(1).join(' ');
    if (!text) return ctx.reply("মেসেজ দিন।");
    const users = await getAllUsers();
    let ok = 0;
    for (const uid of users) {
        try { await ctx.telegram.sendMessage(uid, text); ok++; } catch (e) {}
    }
    ctx.reply(`সফল: ${ok}`);
});

module.exports = async (req, res) => {
    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } else {
        res.status(200).send('Running...');
    }
};
