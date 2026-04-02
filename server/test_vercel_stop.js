const http = require('https');
const { URL } = require('url');

async function testTimerStop() {
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

    // 2. Stop timer
    const stopUrl = new URL('https://epochdash.vercel.app/api/timer/stop');
    
    const result = await new Promise((resolve, reject) => {
        const req = http.request(stopUrl, { 
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${token}`
            } 
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.end();
    });

    console.log("Stop result:", result);
}

testTimerStop().catch(console.error);
