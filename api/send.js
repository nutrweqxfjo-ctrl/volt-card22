// 🚀 استخراج بيانات قاعدة البيانات
function getDbCredentials() {
    let url = process.env.KV_REST_API_URL;
    let token = process.env.KV_REST_API_TOKEN;

    if (!url && process.env.KV_REDIS_URL) {
        try {
            const parsedUrl = new URL(process.env.KV_REDIS_URL);
            url = `https://${parsedUrl.hostname}`;
            token = parsedUrl.password;
        } catch(e) {}
    }
    return { url, token };
}

// 🚀 تحديث الطلب
async function updateOrderStatus(key, value) {
    const creds = getDbCredentials();
    if (!creds.url || !creds.token) return;

    try {
        await fetch(`${creds.url}/set/${key}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${creds.token}` },
            body: JSON.stringify(value)
        });
    } catch (e) {
        console.error("DB Error:", e);
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false });

    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } 
    catch (e) { body = req.body; }

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const CHAT_ID = process.env.CHAT_ID;

    try {
        // 1. استقبال الردود (رسائل الإدارة للعميل)
        if (body && body.message && body.message.reply_to_message) {
            const originalText = body.message.reply_to_message.caption || body.message.reply_to_message.text || "";
            const orderIdMatch = originalText.match(/\+)\]/);
            
            if (orderIdMatch && orderIdMatch) {
                const orderId = orderIdMatch;
                await updateOrderStatus(`msg_${orderId}`, body.message.text);
                
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: CHAT_ID, text: `✅ تم إرسال رسالتك للعميل (طلب ${orderId})`, reply_to_message_id: body.message.message_id })
                });
                return res.status(200).json({ ok: true });
            }
        }

        // 2. استقبال أزرار القبول والرفض
        if (body && body.callback_query) {
            const cbData = body.callback_query.data;
            const msgId = body.callback_query.message.message_id;

            if (cbData.startsWith('accept_') || cbData.startsWith('reject_')) {
                const status = cbData.startsWith('accept_') ? 'completed' : 'rejected';
                const orderId = cbData.split('_');
                
                await updateOrderStatus(orderId, status); 

                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageCaption`, {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: CHAT_ID, 
                        message_id: msgId,
                        caption: (body.callback_query.message.caption || "") + `\n\n--- الحالة: ${status === 'completed' ? 'تم القبول ✅' : 'تم الرفض ❌'} ---`,
                        reply_markup: { inline_keyboard: [] }
                    })
                });
                return res.status(200).json({ ok: true });
            }
        }

        // 3. استقبال الطلبات الجديدة
        if (body && body.type === 'order') {
            const idMatch = body.cardDetails.match(/\+)\]/);
            const orderID = (idMatch && idMatch) ? idMatch : 'Unknown';

            if(orderID !== 'Unknown') {
                await updateOrderStatus(orderID, 'pending');
            }

            const caption = `⚡ طلب جديد - Volt Cards ⚡\n\n📦 ${body.cardDetails}\n👤 الاسم: ${body.userName}\n📲 رقم الهاتف: ${body.transferPhone}`;
            const replyMarkup = JSON.stringify({
                inline_keyboard:
                ]
            });

            const formData = new FormData();
            formData.append('chat_id', CHAT_ID);
            formData.append('caption', caption);
            formData.append('reply_markup', replyMarkup); 
            
            const base64Data = body.imageBase64.split(',');
            const buffer = Buffer.from(base64Data, 'base64');
            const blob = new Blob(, { type: 'image/jpeg' });
            formData.append('photo', blob, 'receipt.jpg');

            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, { method: 'POST', body: formData });
            return res.status(200).json({ ok: true });
        }

        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ ok: false, error: error.message });
    }
}
