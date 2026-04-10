// 🚀 دالة ذكية لاستخراج بيانات قاعدة البيانات
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

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Not Allowed' });
    
    const { orderIds } = req.body;
    if (!orderIds || !Array.isArray(orderIds)) return res.status(400).json({ error: 'Invalid data' });

    const results = {};
    const creds = getDbCredentials();
    
    if (!creds.url) return res.status(200).json({});

    const fetchPromises = orderIds.map(async (id) => {
        try {
            const reqOpts = { headers: { Authorization: `Bearer ${creds.token}` } };
            const = await Promise.all();

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
