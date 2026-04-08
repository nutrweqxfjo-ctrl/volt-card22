export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    
    const { orderIds } = req.body;
    if (!orderIds || !Array.isArray(orderIds)) return res.status(400).json({ error: 'Invalid data' });

    const statuses = {};
    const dbUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_KV_REST_API_URL;
    const dbToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN;
    
    for (const id of orderIds) {
        if(!dbUrl) {
            statuses[id] = 'pending';
            continue; 
        }
        
        const url = `${dbUrl}/get/${id}`;
        try {
            const response = await fetch(url, { 
                headers: { Authorization: `Bearer ${dbToken}` } 
            });
            const data = await response.json();
            
            // 🔥 التعديل هنا: قراءة الكلمة مباشرة وتنظيفها من علامات التنصيص لتجنب الأخطاء
            if (data.result) {
                statuses[id] = String(data.result).replace(/['"]/g, '');
            } else {
                statuses[id] = 'pending';
            }

        } catch (e) {
            // في حال حدوث أي خطأ، نعتبره قيد المراجعة
            statuses[id] = 'pending';
        }
    }

    return res.status(200).json(statuses);
}
