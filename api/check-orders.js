export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    
    const { orderIds } = req.body;
    if (!orderIds || !Array.isArray(orderIds)) return res.status(400).json({ error: 'Invalid data' });

    const results = {};
    const dbUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_KV_REST_API_URL;
    const dbToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN;
    
    // فحص جميع الطلبات في نفس الوقت للسرعة
    const fetchPromises = orderIds.map(async (id) => {
        if(!dbUrl) {
            results[id] = { status: 'pending', message: '' };
            return;
        }
        try {
            const reqOpts = { headers: { Authorization: `Bearer ${dbToken}` } };
            // جلب الحالة وجلب الرسالة معاً
            const [resStatus, resMsg] = await Promise.all([
                fetch(`${dbUrl}/get/${id}`, reqOpts).then(r => r.json()),
                fetch(`${dbUrl}/get/msg_${id}`, reqOpts).then(r => r.json())
            ]);

            let statusVal = resStatus.result ? String(resStatus.result).replace(/['"]/g, '') : 'pending';
            
            // تنظيف الرسالة إن وجدت
            let msgVal = '';
            if (resMsg.result) {
                try { msgVal = JSON.parse(resMsg.result); } 
                catch(e) { msgVal = String(resMsg.result); }
            }
            
            results[id] = { status: statusVal, message: msgVal };
        } catch (e) {
            results[id] = { status: 'pending', message: '' };
        }
    });

    await Promise.all(fetchPromises);
    return res.status(200).json(results);
}
