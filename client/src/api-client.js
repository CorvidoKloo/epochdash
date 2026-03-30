const http = require('http');
const https = require('https');
const { URL } = require('url');

class ApiClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.token = null;
    }

    async request(method, path, body) {
        const url = new URL(`${this.baseUrl}/api${path}`);
        const isHttps = url.protocol === 'https:';
        const client = isHttps ? https : http;

        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        if (this.token) {
            options.headers['Authorization'] = `Bearer ${this.token}`;
        }

        const bodyStr = body ? JSON.stringify(body) : null;
        if (bodyStr) {
            options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }

        return new Promise((resolve, reject) => {
            const req = client.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (res.statusCode >= 400) {
                            reject(new Error(json.error || `HTTP ${res.statusCode}`));
                        } else {
                            resolve(json);
                        }
                    } catch {
                        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
                        else resolve(data);
                    }
                });
            });

            req.on('error', (e) => reject(new Error(`Connection failed: ${e.message}`)));
            req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });

            if (bodyStr) req.write(bodyStr);
            req.end();
        });
    }

    get(path) { return this.request('GET', path); }
    post(path, body) { return this.request('POST', path, body); }
    put(path, body) { return this.request('PUT', path, body); }
    del(path) { return this.request('DELETE', path); }

    async login(email, password) {
        const data = await this.post('/auth/login', { email, password });
        this.token = data.token;
        return data;
    }

    async uploadScreenshot(timeEntryId, imageBase64, thumbBase64) {
        return this.post('/screenshots/upload-base64', {
            time_entry_id: timeEntryId,
            image: imageBase64,
            thumbnail: thumbBase64
        });
    }
}

module.exports = ApiClient;
