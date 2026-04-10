export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    
    const { orderIds } = req.body;
    if (!orderIds || !Array.isArray(orderIds)) return res.status(400).json({ error: 'Invalid data' });

    const results = {};
    const dbUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_KV_REST_API_URL;
    const dbToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN;
    
    const fetchPromises = orderIds.map(async (id) => {
        if(!dbUrl) {
            results = { status: 'pending', message: '' };
            return;
        }
        try {
            // جلب الحالة والرسالة بنفس طريقة الحفظ المضمونة
            const = await Promise.all()
                }),
                fetch(dbUrl, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${dbToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify()
                })
            ]);

            const resStatus = await reqStatus.json();
            const resMsg = await reqMsg.json();

            let statusVal = resStatus.result ? String(resStatus.result) : 'pending';
            let msgVal = resMsg.result ? String(resMsg.result) : '';

            results = { status: statusVal, message: msgVal };
        } catch (e) {
            results = { status: 'pending', message: '' };
        }
    });

    await Promise.all(fetchPromises);
    return res.status(200).json(results);
}
