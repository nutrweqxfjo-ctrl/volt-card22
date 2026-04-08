const rateLimitMap = new Map();

// 🚀 دالة لتحديث حالة الطلب في قاعدة البيانات 
async function updateOrderStatus(orderId, status) {
    // الكود الآن ذكي جداً ويبحث عن قاعدة البيانات بأي اسم وضعته Vercel
    const dbUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_KV_REST_API_URL || process.env.STORAGE_UPSTASH_REDIS_REST_URL;
    const dbToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN || process.env.STORAGE_UPSTASH_REDIS_REST_TOKEN;

    if (!dbUrl || !dbToken) {
        console.log("تنبيه: قاعدة البيانات غير متصلة بعد.");
        return;
    }
    const url = `${dbUrl}/set/${orderId}`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${dbToken}` },
            body: JSON.stringify(`"${status}"`) 
        });
    } catch (e) {
        console.error("خطأ في تحديث قاعدة البيانات:", e);
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } 
    catch (e) { body = req.body; }

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const CHAT_ID = process.env.CHAT_ID;

    // ==========================================
    // 1. استقبال أوامر البوت (لوحة التحكم من تيليجرام)
    // ==========================================
    if (body && body.callback_query) {
        const callbackData = body.callback_query.data;
        const messageId = body.callback_query.message.message_id;
        const callbackQueryId = body.callback_query.id;

        let responseText = "";
        
        if (callbackData.startsWith('accept_')) {
            const orderId = callbackData.split('_')[1];
            await updateOrderStatus(orderId, 'completed'); 
            responseText = `✅ تم قبول الطلب [${orderId}].\n(يجب عليك إرسال كود البطاقة للعميل)`;
        } else if (callbackData.startsWith('reject_')) {
            const orderId = callbackData.split('_')[1];
            await updateOrderStatus(orderId, 'rejected'); 
            responseText = `❌ تم رفض الطلب [${orderId}] (وصل غير صالح أو مرفوض).`;
        }

        try {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageCaption`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    message_id: messageId,
                    caption: (body.callback_query.message.caption || "") + `\n\n--- حالة الطلب ---\n${responseText}`,
                    reply_markup: { inline_keyboard: [] }
                })
            });

            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callback_query_id: callbackQueryId,
                    text: callbackData.startsWith('accept_') ? "تم القبول وتحديث الموقع!" : "تم الرفض وتحديث الموقع!",
                })
            });
            return res.status(200).json({ ok: true });
        } catch (error) { return res.status(500).json({ ok: false }); }
    }

    // ==========================================
    // 2. نظام الحماية (Anti-Spam)
    // ==========================================
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const currentTime = Date.now();

    if (body.type === 'order' || body.type === 'custom') {
        const orderKey = ip + '_order';
        const userRequests = rateLimitMap.get(orderKey) || [];
        const recentRequests = userRequests.filter(time => currentTime - time < (30 * 60 * 1000));

        if (recentRequests.length >= 2) return res.status(429).json({ ok: false, error: 'تم إرسال طلبات كثيرة. يرجى الانتظار.' });
        
        recentRequests.push(currentTime);
        rateLimitMap.set(orderKey, recentRequests);
    } 
    else if (body.type === 'visit') {
        const visitKey = ip + '_visit';
        const lastVisit = rateLimitMap.get(visitKey) || 0;
        if (currentTime - lastVisit < (12 * 60 * 60 * 1000)) return res.status(200).json({ ok: true, note: 'Visit already recorded' });
        rateLimitMap.set(visitKey, currentTime);
    }

    // ==========================================
    // 3. استقبال الطلبات من الموقع وإرسالها لتيليجرام
    // ==========================================
    try {
        if (body.type === 'visit') {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: CHAT_ID, text: body.customName })
            });
            return res.status(200).json({ ok: true });
        }

        if (body.type === 'custom') {
            const text = `🌟 طلب خاص جديد - Volt Cards 🌟\n\n📦 الخدمة: ${body.customName}\n📞 التواصل: ${body.customContact}`;
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: CHAT_ID, text: text })
            });
            return res.status(200).json({ ok: true });
        }

        if (body.type === 'order') {
            const orderIdMatch = body.cardDetails.match(/\[(V-\w+)\]/);
            const orderID = orderIdMatch ? orderIdMatch[1] : 'Unknown';

            // تسجيل الطلب كـ "قيد المراجعة"
            if(orderID !== 'Unknown') await updateOrderStatus(orderID, 'pending');

            const caption = `⚡ طلب جديد - Volt Cards ⚡\n\n📦 ${body.cardDetails}\n👤 الاسم: ${body.userName}\n📲 رقم التحويل: ${body.transferPhone}`;
            
            const replyMarkup = JSON.stringify({
                inline_keyboard: [
                    [{ text: "✅ قبول الطلب", callback_data: `accept_${orderID}` }],
                    [{ text: "❌ رفض (وصل وهمي)", callback_data: `reject_${orderID}` }]
                ]
            });

            const formData = new FormData();
            formData.append('chat_id', CHAT_ID);
            formData.append('caption', caption);
            formData.append('reply_markup', replyMarkup); 
            
            const base64Data = body.imageBase64.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const blob = new Blob([buffer], { type: 'image/jpeg' });
            formData.append('photo', blob, 'receipt.jpg');

            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, { method: 'POST', body: formData });
            const data = await response.json();
            return res.status(200).json(data);
        }
        
        return res.status(400).json({ ok: false, error: 'نوع الطلب غير معروف' });
    } catch (error) { return res.status(500).json({ ok: false }); }
}
