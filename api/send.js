const rateLimitMap = new Map();

// 🚀 دالة تحديث الحالة والرسائل في قاعدة البيانات
async function updateOrderStatus(key, value) {
    const dbUrl = process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const dbToken = process.env.KV_REST_API_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!dbUrl || !dbToken) return;

    try {
        await fetch(`${dbUrl}/set/${key}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${dbToken}` },
            body: JSON.stringify(value)
        });
    } catch (e) {
        console.error("خطأ في قاعدة البيانات:", e);
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } 
    catch (e) { body = req.body; }

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const CHAT_ID = process.env.CHAT_ID;

    // 1. استقبال ردودك (Reply) من تيليجرام لإرسال رسالة للعميل
    if (body && body.message && body.message.reply_to_message) {
        const originalText = body.message.reply_to_message.caption || body.message.reply_to_message.text || "";
        const orderIdMatch = originalText.match(/\[(V-\w+)\]/);
        
        if (orderIdMatch) {
            const orderId = orderIdMatch[1];
            const adminReply = body.message.text;
            await updateOrderStatus(`msg_${orderId}`, adminReply);
            
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    text: `✅ تم إرسال رسالتك للعميل بنجاح للطلب [${orderId}]`,
                    reply_to_message_id: body.message.message_id
                })
            });
            return res.status(200).json({ ok: true });
        }
    }

    // 2. استقبال أزرار القبول والرفض من تيليجرام
    if (body && body.callback_query) {
        const callbackData = body.callback_query.data;
        const messageId = body.callback_query.message.message_id;
        const callbackQueryId = body.callback_query.id;

        if (callbackData.startsWith('accept_') || callbackData.startsWith('reject_')) {
            const status = callbackData.startsWith('accept_') ? 'completed' : 'rejected';
            const orderId = callbackData.split('_')[1];
            
            await updateOrderStatus(orderId, status); 

            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageCaption`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CHAT_ID, message_id: messageId,
                    caption: (body.callback_query.message.caption || "") + `\n\n--- الحالة: ${status === 'completed' ? 'تم القبول ✅' : 'تم الرفض ❌'} ---`,
                    reply_markup: { inline_keyboard: [] }
                })
            });
            return res.status(200).json({ ok: true });
        }
    }

    // 3. استقبال الطلبات من الموقع
    try {
        if (body.type === 'order') {
            const orderIdMatch = body.cardDetails.match(/\[(V-\w+)\]/);
            const orderID = orderIdMatch ? orderIdMatch[1] : 'Unknown';

            if(orderID !== 'Unknown') await updateOrderStatus(orderID, 'pending');

            const caption = `⚡ طلب جديد - Volt Cards ⚡\n\n📦 ${body.cardDetails}\n👤 الاسم: ${body.userName}\n📲 رقم الهاتف: ${body.transferPhone}`;
            const replyMarkup = JSON.stringify({
                inline_keyboard: [
                    [{ text: "✅ قبول الطلب", callback_data: `accept_${orderID}` }, { text: "❌ رفض الطلب", callback_data: `reject_${orderID}` }]
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

            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, { method: 'POST', body: formData });
            return res.status(200).json({ ok: true });
        }
        
        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ ok: false, error: error.message });
    }
}
