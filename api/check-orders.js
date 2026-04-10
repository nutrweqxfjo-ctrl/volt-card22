export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Not Allowed');
    
    const { orderIds } = req.body;
    const results = {};
    const dbUrl = process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const dbToken = process.env.KV_REST_API_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    const fetchPromises = orderIds.map(async (id) => {
        try {
            const reqOpts = { headers: { Authorization: `Bearer ${dbToken}` } };
            const [sRes, mRes] = await Promise.all([
                fetch(`${dbUrl}/get/${id}`, reqOpts).then(r => r.json()),
                fetch(`${dbUrl}/get/msg_${id}`, reqOpts).then(r => r.json())
            ]);
            results[id] = {
                status: sRes.result ? String(sRes.result).replace(/['"]/g, '') : 'pending',
                message: mRes.result ? String(mRes.result).replace(/['"]/g, '') : ''
            };
        } catch (e) { results[id] = { status: 'pending', message: '' }; }
    });

    await Promise.all(fetchPromises);
    return res.status(200).json(results);
}
