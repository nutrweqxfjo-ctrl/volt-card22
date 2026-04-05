// خريطة (Map) لحفظ أرقام الـ IP وأوقات الطلبات في ذاكرة السيرفر
// ستعمل هذه الذاكرة كدرع قوي لصد السبام المتتالي
const rateLimitMap = new Map();

export default async function handler(req, res) {
    // 1. التأكد من أن الطلب هو POST
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    // ==========================================
    //  نظام الحماية من المخربين (Anti-Spam)
    // ==========================================
    
    // استخراج الـ IP الحقيقي للزائر
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    // إعدادات الحماية: طلبين (2) فقط كل 30 دقيقة
    const MAX_REQUESTS = 2;
    const TIME_WINDOW = 30 * 60 * 1000; // 30 دقيقة
    const currentTime = Date.now();

    // جلب سجل أوقات الطلبات السابقة لهذا الـ IP
    const userRequests = rateLimitMap.get(ip) || [];

    // تصفية الطلبات: نحتفظ فقط بالطلبات التي حدثت خلال الـ 30 دقيقة الماضية
    const recentRequests = userRequests.filter(time => currentTime - time < TIME_WINDOW);

    // التحقق من الحظر: هل تجاوز الحد؟
    if (recentRequests.length >= MAX_REQUESTS) {
        console.warn(`[BLOCKED SPAM] IP: ${ip}`);
        return res.status(429).json({ 
            ok: false, 
            error: 'تم إرسال طلبات كثيرة. يرجى الانتظار 30 دقيقة قبل المحاولة مرة أخرى.' 
        });
    }

    // السماح بالطلب: تحديث سجل الـ IP بالطلب الجديد
    recentRequests.push(currentTime);
    rateLimitMap.set(ip, recentRequests);

    // ==========================================
    //  كود إرسال الطلبات إلى بوت تيليجرام
    // ==========================================

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const CHAT_ID = process.env.CHAT_ID;
    const body = req.body;

    try {
        // حالة: طلب خاص
        if (body.type === 'custom') {
            const text = `🌟 طلب خاص جديد - Volt Cards 🌟\n\n📦 البطاقة المطلوبة: ${body.customName}\n📞 التواصل: ${body.customContact}`;
            
            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: CHAT_ID, text: text })
            });
            const data = await response.json();
            // الـ Telegram API يُرجع دائماً {ok: true} عند النجاح
            return res.status(200).json(data);
        }

        // حالة: طلب شراء بطاقة (مع صورة)
        if (body.type === 'order') {
            const caption = `⚡ طلب جديد - Volt Cards ⚡\n\n📦 البطاقة/الخدمة: ${body.cardDetails}\n👤 الاسم: ${body.userName}\n📲 رقم التحويل: ${body.transferPhone}`;
            
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
        console.error('Telegram API Error:', error);
        return res.status(500).json({ ok: false, error: 'Internal Server Error' });
    }
}
