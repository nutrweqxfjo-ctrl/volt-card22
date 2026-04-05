export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const CHAT_ID = process.env.CHAT_ID;
    const body = req.body;

    try {
        if (body.type === 'custom') {
            const text = `🌟 طلب خاص جديد - Volt Cards 🌟\n\n📦 البطاقة المطلوبة: ${body.customName}\n📞 التواصل: ${body.customContact}`;
            
            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: CHAT_ID, text: text })
            });
            const data = await response.json();
            return res.status(200).json(data);
        }

        if (body.type === 'order') {
            const caption = `⚡ طلب جديد - Volt Cards ⚡\n\n📦 البطاقة: ${body.cardDetails}\n👤 الاسم: ${body.userName}\n📲 رقم التحويل: ${body.transferPhone}`;
            
            const formData = new FormData();
            formData.append('chat_id', CHAT_ID);
            formData.append('caption', caption);
            
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
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
