export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Not Allowed' });
    }
    
    const orderIds = req.body.orderIds;
    if (!orderIds || !Array.isArray(orderIds)) {
        return res.status(400).json({ error: 'Invalid data' });
    }

    const results = {};
    
    let url = process.env.KV_REST_API_URL;
    let token = process.env.KV_REST_API_TOKEN;

    if (!url && process.env.KV_REDIS_URL) {
        try {
            const parsedUrl = new URL(process.env.KV_REDIS_URL);
            url = "https://" + parsedUrl.hostname;
            token = parsedUrl.password;
        } catch(e) {}
    }
    
    if (!url) {
        return res.status(200).json({});
    }

    const fetchPromises = orderIds.map(async (id) => {
        try {
            const reqOpts = { headers: { Authorization: "Bearer " + token } };
            
            const reqStatus = await fetch(url + "/get/" + id, reqOpts);
            const resStatus = await reqStatus.json();
            
            const reqMsg = await fetch(url + "/get/msg_" + id, reqOpts);
            const resMsg = await reqMsg.json();

            const finalStatus = resStatus.result ? String(resStatus.result).replace(//g, '') : "pending";
            const finalMsg = resMsg.result ? String(resMsg.result).replace(//g, '') : "";

            results = { status: finalStatus, message: finalMsg };
        } catch (e) {
            results = { status: "pending", message: "" };
        }
    });

    await Promise.all(fetchPromises);
    return res.status(200).json(results);
}
