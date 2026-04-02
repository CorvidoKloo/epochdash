const http = require('https');
const { URL } = require('url');

async function testUpload() {
    const loginData = JSON.stringify({ email: 'admin@epochdash.local', password: 'admin123' });
    const authUrl = new URL('https://epochdash.vercel.app/api/auth/login');
    
    // 1. Login
    const token = await new Promise((resolve, reject) => {
        const req = http.request(authUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginData) } }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data).token));
        });
        req.write(loginData);
        req.end();
    });

    console.log("Logged in, token:", token.substring(0, 10));

    // 2. Upload screenshot
    const uploadUrl = new URL('https://epochdash.vercel.app/api/screenshots/upload-base64');
    
    const fakeImageBuffer = Buffer.alloc(100, 0); // tiny fake image
    const base64 = `data:image/jpeg;base64,${fakeImageBuffer.toString('base64')}`;

    const uploadData = JSON.stringify({
        time_entry_id: null,
        image: base64,
        thumbnail: base64
    });

    const result = await new Promise((resolve, reject) => {
        const req = http.request(uploadUrl, { 
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${token}`,
                'Content-Length': Buffer.byteLength(uploadData) 
            } 
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.write(uploadData);
        req.end();
    });

    console.log("Upload result:", result);
}

testUpload().catch(console.error);
