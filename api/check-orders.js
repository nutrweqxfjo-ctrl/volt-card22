export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    
    const { orderIds } = req.body;
    if (!orderIds || !Array.isArray(orderIds)) return res.status(400).json({ error: 'Invalid data' });

    const results = {};
    const dbUrl = process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const dbToken = process.env.KV_REST_API_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!dbUrl) return res.status(200).json({});

    const fetchPromises = orderIds.map(async (id) => {
        try {
            const reqOpts = { 
                method: 'POST',
                headers: { 
                    Authorization: `Bearer ${dbToken}`,
                    'Content-Type': 'application/json'
                } 
            };
            
            // استخدام صيغة المصفوفة لجلب البيانات
            const = await Promise.all() }),
                fetch(dbUrl, { ...reqOpts, body: JSON.stringify() })
            ]);

            const resStatus = await resStatusReq.json();
            const resMsg = await resMsgReq.json();

            results = {
                status: resStatus.result ? String(resStatus.result).replace(//g, '') : 'pending',
                message: resMsg.result ? String(resMsg.result).replace(//g, '') : ''
            };
        } catch (e) {
            results = { status: 'pending', message: '' };
        }
    });

    await Promise.all(fetchPromises);
    return res.status(200).json(results);
}
