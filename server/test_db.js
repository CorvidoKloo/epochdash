const { Pool } = require('pg');

const url = 'postgresql://postgres.acetaaihaymgypibgqld:KillerFeeder890689!@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres';
const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log('Connecting...');
        const client = await pool.connect();
        console.log('Connected!');
        
        console.log('Checking tables...');
        const res = await client.query("SELECT to_regclass('public.users') as exists");
        console.log('Users table exists?', res.rows[0].exists !== null);
        
        if (res.rows[0].exists) {
            const count = await client.query('SELECT count(*) FROM users');
            console.log('Users count:', count.rows[0].count);
            
            const admin = await client.query("SELECT * FROM users WHERE email='admin@epochdash.local'");
            console.log('Admin exists?', admin.rows.length > 0);
        }
        
        client.release();
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

run();
