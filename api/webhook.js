const { Telegraf, Markup } = require('telegraf');
const { saveUser, getAllUsers, db } = require('../firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- START COMMAND & DEEP LINK ---
bot.start(async (ctx) => {
    const payload = ctx.startPayload;
    await saveUser(ctx.from);

    if (!payload) {
        return ctx.reply("স্বাগতম! ভিডিও পেতে সঠিক লিঙ্ক ব্যবহার করুন।");
    }

    // Channel Join Check
    try {
        const member = await ctx.telegram.getChatMember(process.env.CHANNEL_ID, ctx.from.id);
        if (!['member', 'administrator', 'creator'].includes(member.status)) {
            return ctx.reply("⚠️ ভিডিওটি পেতে আগে আমাদের চ্যানেলে জয়েন করুন!", Markup.inlineKeyboard([
                [Markup.button.url("Join Channel", `https://t.me/YourChannelUsername`)替換],
                [Markup.button.url("Try Again", `https://t.me/${ctx.botInfo.username}?start=${payload}`)]
            ]));
        }
    } catch (e) {
        return ctx.reply("বটকে চ্যানেলে অ্যাডমিন করতে হবে!");
    }

    // Fetch Video Message ID from Firebase (Mapping)
    const doc = await db.collection('links').doc(payload).get();
    if (doc.exists) {
        const { message_id } = doc.data();
        await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, message_id);
    } else {
        ctx.reply("❌ দুঃখিত! ফাইলটি খুঁজে পাওয়া যায়নি।");
    }
});

// --- ADMIN: UPLOAD VIDEO & GET AD LINK ---
bot.on(['video', 'document'], async (ctx) => {
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;

    const msg = await ctx.telegram.copyMessage(process.env.CHANNEL_ID, ctx.chat.id, ctx.message.message_id);
    const uniqueId = `vid_${Date.now()}`; // Unique ID based on time

    // Save mapping in Firebase
    await db.collection('links').doc(uniqueId).set({ message_id: msg.message_id });

    const adLink = `https://${process.env.VERCEL_URL}/?id=${uniqueId}`;
    ctx.reply(`✅ ফাইল সেভ হয়েছে!\n\nআপনার অ্যাড লিঙ্ক:\n${adLink}`);
});

// --- ADMIN: BROADCAST ---
bot.command('broadcast', async (ctx) => {
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return ctx.reply("Not Authorized!");
    const text = ctx.message.text.split(' ').slice(1).join(' ');
    if (!text) return ctx.reply("Syntax: /broadcast message");

    const users = await getAllUsers();
    let count = 0;
    for (const uid of users) {
        try {
            await ctx.telegram.sendMessage(uid, text);
            count++;
        } catch (e) {}
    }
    ctx.reply(`সফলভাবে ${count} জনের কাছে পৌঁছানো হয়েছে।`);
});

// Vercel Export
module.exports = async (req, res) => {
    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } else {
        res.status(200).send('Server is Running...');
    }
};
