// دالة تحديث الحالة مع نظام فحص الأخطاء
async function updateOrderStatus(key, value) {
    const dbUrl = process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const dbToken = process.env.KV_REST_API_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!dbUrl || !dbToken) {
        console.error("خطأ: بيانات الاتصال بقاعدة البيانات مفقودة في إعدادات Vercel");
        return;
    }

    try {
        const response = await fetch(`${dbUrl}/set/${key}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${dbToken}` },
            body: JSON.stringify(value)
        });
        const resData = await response.json();
        console.log(`تم تحديث القاعدة للطلب ${key}:`, resData);
    } catch (e) {
        console.error("فشل الاتصال بقاعدة البيانات:", e);
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const CHAT_ID = process.env.CHAT_ID;

    // معالجة الضغط على أزرار القبول والرفض
    if (body.callback_query) {
        const callbackData = body.callback_query.data;
        const messageId = body.callback_query.message.message_id;
        
        const action = callbackData.startsWith('accept_') ? 'completed' : 'rejected';
        const orderId = callbackData.split('_')[1];

        // 🟢 تحديث قاعدة البيانات فوراً
        await updateOrderStatus(orderId, action);

        // تحديث رسالة البوت لتأكيد العملية
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageCaption`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                message_id: messageId,
                caption: (body.callback_query.message.caption || "") + `\n\n✅ تم التحديث في الموقع: ${action === 'completed' ? 'مقبول' : 'مرفوض'}`,
                reply_markup: { inline_keyboard: [] }
            })
        });
        return res.status(200).json({ ok: true });
    }

    // استقبال الطلب الجديد من الموقع
    if (body.type === 'order') {
        const orderIdMatch = body.cardDetails.match(/\[(V-\w+)\]/);
        const orderID = orderIdMatch ? orderIdMatch[1] : 'Unknown';

        // تسجيل الطلب كـ "قيد الانتظار"
        if(orderID !== 'Unknown') await updateOrderStatus(orderID, 'pending');

        const caption = `⚡ طلب جديد - Volt Cards ⚡\n\n📦 ${body.cardDetails}\n👤 الاسم: ${body.userName}\n📲 رقم الهاتف: ${body.transferPhone}`;
        const replyMarkup = JSON.stringify({
            inline_keyboard: [
                [{ text: "✅ قبول", callback_data: `accept_${orderID}` }, { text: "❌ رفض", callback_data: `reject_${orderID}` }]
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

    // معالجة الردود (الرسائل المباشرة للعميل)
    if (body.message && body.message.reply_to_message) {
        const caption = body.message.reply_to_message.caption || "";
        const idMatch = caption.match(/\[(V-\w+)\]/);
        if (idMatch) {
            await updateOrderStatus(`msg_${idMatch[1]}`, body.message.text);
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: CHAT_ID, text: `✅ وصلت رسالتك للعميل (طلب ${idMatch[1]})`, reply_to_message_id: body.message.message_id })
            });
        }
    }
    return res.status(200).json({ ok: true });
}
