const rateLimitMap = new Map();

async function updateOrderStatus(key, value) {
    const dbUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_KV_REST_API_URL;
    const dbToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN;

    if (!dbUrl || !dbToken) return;
    
    const url = `${dbUrl}/set/${key}`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${dbToken}` },
            body: JSON.stringify(value) 
        });
    } catch (e) {
        console.error("DB Error:", e);
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
    // 0. استقبال رسائل الإدارة (عندما تقوم بالرد على الطلب في تيليجرام)
    // ==========================================
    if (body && body.message && body.message.reply_to_message) {
        const originalText = body.message.reply_to_message.caption || body.message.reply_to_message.text || "";
        const orderIdMatch = originalText.match(/\[(V-\w+)\]/);
        
        if (orderIdMatch) {
            const orderId = orderIdMatch[1];
            const adminReply = body.message.text; // الرسالة التي كتبتها أنت (الكود أو سبب الرفض)
            
            // حفظ الرسالة في قاعدة البيانات بمفتاح خاص (msg_ID)
            await updateOrderStatus(`msg_${orderId}`, adminReply);
            
            // إرسال تأكيد لك في تيليجرام
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    text: `✅ تم إرسال الرسالة للعميل بنجاح للطلب [${orderId}]\nالرسالة: ${adminReply}`,
                    reply_to_message_id: body.message.message_id
                })
            });
            return res.status(200).json({ ok: true });
        }
    }

    // ==========================================
    // 1. استقبال أزرار التحكم (قبول / رفض)
    // ==========================================
    if (body && body.callback_query) {
        const callbackData = body.callback_query.data;
        const messageId = body.callback_query.message.message_id;
        const callbackQueryId = body.callback_query.id;

        let responseText = "";
        
        if (callbackData.startsWith('accept_')) {
            const orderId = callbackData.split('_')[1];
            await updateOrderStatus(orderId, 'completed'); 
            responseText = `✅ تم قبول الطلب [${orderId}].\n(الآن قم بعمل "رد Reply" على هذه الرسالة واكتب كود البطاقة للعميل)`;
        } else if (callbackData.startsWith('reject_')) {
            const orderId = callbackData.split('_')[1];
            await updateOrderStatus(orderId, 'rejected'); 
            responseText = `❌ تم رفض الطلب [${orderId}].\n(يمكنك عمل "رد Reply" وكتابة سبب الرفض ليراه العميل)`;
        }

        try {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageCaption`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CHAT_ID, message_id: messageId,
                    caption: (body.callback_query.message.caption || "") + `\n\n--- حالة الطلب ---\n${responseText}`,
                    reply_markup: { inline_keyboard: [] }
                })
            });

            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: callbackQueryId, text: "تم تحديث حالة الطلب في الموقع!" })
            });
            return res.status(200).json({ ok: true });
        } catch (error) { return res.status(500).json({ ok: false }); }
    }

    // ==========================================
    // 2. استقبال الطلبات من الموقع 
    // ==========================================
    try {
        if (body.type === 'order') {
            const orderIdMatch = body.cardDetails.match(/\[(V-\w+)\]/);
            const orderID = orderIdMatch ? orderIdMatch[1] : 'Unknown';

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
        
        // (زيارات وطلبات خاصة للتبسيط موجودة في الكود الأصلي)
        return res.status(200).json({ ok: true });
    } catch (error) { return res.status(500).json({ ok: false }); }
}
