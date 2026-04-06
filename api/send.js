// خريطة (Map) لحفظ أرقام الـ IP وأوقات الطلبات في ذاكرة السيرفر
// ستعمل هذه الذاكرة كدرع قوي لصد السبام المتتالي
const rateLimitMap = new Map();

export default async function handler(req, res) {
    // 1. التأكد من أن الطلب هو POST
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    const body = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const currentTime = Date.now();

    // ==========================================
    //  نظام الحماية من المخربين (Anti-Spam)
    // ==========================================
    
    // أ- حماية طلبات الشراء والطلبات الخاصة (طلبين كل 30 دقيقة)
    if (body.type === 'order' || body.type === 'custom') {
        const orderKey = ip + '_order';
        const MAX_REQUESTS = 2;
        const TIME_WINDOW = 30 * 60 * 1000; // 30 دقيقة

        const userRequests = rateLimitMap.get(orderKey) || [];
        const recentRequests = userRequests.filter(time => currentTime - time < TIME_WINDOW);

        if (recentRequests.length >= MAX_REQUESTS) {
            console.warn(`[BLOCKED SPAM] IP: ${ip}`);
            return res.status(429).json({ 
                ok: false, 
                error: 'تم إرسال طلبات كثيرة. يرجى الانتظار 30 دقيقة قبل المحاولة مرة أخرى.' 
            });
        }
        recentRequests.push(currentTime);
        rateLimitMap.set(orderKey, recentRequests);
    } 
    // ب- حماية إشعارات الزوار (إشعار واحد كل 12 ساعة لنفس الـ IP) لتجنب الإزعاج
    else if (body.type === 'visit') {
        const visitKey = ip + '_visit';
        const VISIT_COOLDOWN = 12 * 60 * 60 * 1000; // 12 ساعة
        
        const lastVisit = rateLimitMap.get(visitKey) || 0;
        if (currentTime - lastVisit < VISIT_COOLDOWN) {
            // تجاهل الإشعار بصمت لأننا أرسلناه مسبقاً
            return res.status(200).json({ ok: true, note: 'Visit already recorded recently' });
        }
        rateLimitMap.set(visitKey, currentTime);
    }

    // ==========================================
    //  كود إرسال الطلبات إلى بوت تيليجرام
    // ==========================================

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const CHAT_ID = process.env.CHAT_ID;

    try {
        // حالة: زيارة الموقع (Analytics)
        if (body.type === 'visit') {
            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: CHAT_ID, text: body.customName }) // المتغير customName يحمل تفاصيل الزائر
            });
            const data = await response.json();
            return res.status(200).json(data);
        }

        // حالة: طلب خاص
        if (body.type === 'custom') {
            const text = `🌟 طلب خاص جديد - Volt Cards 🌟\n\n📦 الخدمة/البطاقة المطلوبة: ${body.customName}\n📞 التواصل: ${body.customContact}`;
            
            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: CHAT_ID, text: text })
            });
            const data = await response.json();
            return res.status(200).json(data);
        }

        // حالة: طلب شراء بطاقة (مع صورة)
        if (body.type === 'order') {
            const caption = `⚡ طلب جديد - Volt Cards ⚡\n\n📦 ${body.cardDetails}\n👤 الاسم: ${body.userName}\n📲 رقم التحويل: ${body.transferPhone}`;
            
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

        // إذا كان النوع غير معروف
        return res.status(400).json({ ok: false, error: 'نوع الطلب غير معروف' });

    } catch (error) {
        console.error('Telegram API Error:', error);
        return res.status(500).json({ ok: false, error: 'Internal Server Error' });
    }
}
