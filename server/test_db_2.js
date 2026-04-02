const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const url = 'postgresql://postgres.acetaaihaymgypibgqld:KillerFeeder890689!@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres';
const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        const client = await pool.connect();
        
        const res = await client.query("SELECT * FROM users WHERE email='admin@epochdash.local'");
        const user = res.rows[0];
        console.log('User found:', !!user);
        
        if (user) {
            console.log('is_active:', user.is_active);
            console.log('role:', user.role);
            
            const valid = bcrypt.compareSync('admin123', user.password_hash);
            console.log('Password valid?:', valid);
        }
        
        client.release();
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

run();
