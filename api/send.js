// خريطة (Map) لحفظ أرقام الـ IP وأوقات الطلبات في ذاكرة السيرفر
const rateLimitMap = new Map();

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    const body = req.body;
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const CHAT_ID = process.env.CHAT_ID;

    // ==========================================
    // 1. استقبال أوامر البوت (Webhook) - لوحة التحكم
    // ==========================================
    // إذا كان الطلب قادماً من تيليجرام نفسه (عند ضغطك على زر قبول/رفض)
    if (body.update_id && body.callback_query) {
        const callbackData = body.callback_query.data;
        const messageId = body.callback_query.message.message_id;

        let responseText = "";
        
        if (callbackData.startsWith('accept_')) {
            const orderId = callbackData.split('_')[1];
            // هنا يمكنك لاحقاً ربط الكود بقاعدة بيانات لجلب كود البطاقة وإرساله
            responseText = `✅ تم قبول الطلب [${orderId}].\n(يجب عليك إرسال كود البطاقة للعميل)`;
        } else if (callbackData.startsWith('reject_')) {
            const orderId = callbackData.split('_')[1];
            responseText = `❌ تم رفض الطلب [${orderId}] (وصل وهمي أو مرفوض).`;
        }

        // تعديل الرسالة في البوت لإخفاء الأزرار وإظهار حالة الطلب
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageCaption`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                message_id: messageId,
                caption: body.callback_query.message.caption + `\n\n--- الحالة ---\n${responseText}`,
                reply_markup: { inline_keyboard: [] } // إخفاء الأزرار بعد الضغط عليها
            })
        });

        // إرسال رد لتيليجرام لإنهاء حالة التحميل (الـ Loading في الزر)
        return res.status(200).json({ ok: true });
    }


    // ==========================================
    // 2. نظام الحماية من المخربين (Anti-Spam)
    // ==========================================
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const currentTime = Date.now();

    if (body.type === 'order' || body.type === 'custom') {
        const orderKey = ip + '_order';
        const userRequests = rateLimitMap.get(orderKey) || [];
        const recentRequests = userRequests.filter(time => currentTime - time < (30 * 60 * 1000));

        if (recentRequests.length >= 2) {
            return res.status(429).json({ ok: false, error: 'تم إرسال طلبات كثيرة.' });
        }
        recentRequests.push(currentTime);
        rateLimitMap.set(orderKey, recentRequests);
    } 
    else if (body.type === 'visit') {
        const visitKey = ip + '_visit';
        const lastVisit = rateLimitMap.get(visitKey) || 0;
        if (currentTime - lastVisit < (12 * 60 * 60 * 1000)) {
            return res.status(200).json({ ok: true, note: 'Visit already recorded' });
        }
        rateLimitMap.set(visitKey, currentTime);
    }

    // ==========================================
    // 3. إرسال الطلبات إلى بوت تيليجرام
    // ==========================================
    try {
        if (body.type === 'visit') {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: CHAT_ID, text: body.customName })
            });
            return res.status(200).json({ ok: true });
        }

        if (body.type === 'custom') {
            const text = `🌟 طلب خاص جديد - Volt Cards 🌟\n\n📦 الخدمة: ${body.customName}\n📞 التواصل: ${body.customContact}`;
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: CHAT_ID, text: text })
            });
            return res.status(200).json({ ok: true });
        }

        if (body.type === 'order') {
            // استخراج ID الطلب من النص (الذي أرسلناه من الفرونت إند)
            const orderIdMatch = body.cardDetails.match(/\[(V-\w+)\]/);
            const orderID = orderIdMatch ? orderIdMatch[1] : 'Unknown';

            const caption = `⚡ طلب جديد - Volt Cards ⚡\n\n📦 ${body.cardDetails}\n👤 الاسم: ${body.userName}\n📲 رقم التحويل: ${body.transferPhone}`;
            
            // إنشاء أزرار التحكم
            const replyMarkup = JSON.stringify({
                inline_keyboard: [
                    [{ text: "✅ قبول الطلب", callback_data: `accept_${orderID}` }],
                    [{ text: "❌ رفض (وصل وهمي)", callback_data: `reject_${orderID}` }]
                ]
            });

            const formData = new FormData();
            formData.append('chat_id', CHAT_ID);
            formData.append('caption', caption);
            formData.append('reply_markup', replyMarkup); // إضافة الأزرار للرسالة
            
            const base64Data = body.imageBase64.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const blob = new Blob([buffer], { type: 'image/jpeg' });
            
            formData.append('photo', blob, 'receipt.jpg');

            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            return res.status(200).json(data);
        }

        return res.status(400).json({ ok: false, error: 'نوع الطلب غير معروف' });

    } catch (error) {
        console.error('Telegram API Error:', error);
        return res.status(500).json({ ok: false, error: 'Internal Server Error' });
    }
}
