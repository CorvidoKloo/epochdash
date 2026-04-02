const { DB } = require('./src/database');
const env = { DATABASE_URL: 'postgresql://postgres.acetaaihaymgypibgqld:KillerFeeder890689!@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres' };

async function applyFix() {
    const db = new DB(env.DATABASE_URL);
    await db.connect();
    
    try {
        await db.pool.query('CREATE UNIQUE INDEX idx_single_running_timer ON time_entries (user_id) WHERE is_running = 1');
        console.log("Applied unique index successfully!");
    } catch (e) {
        console.log("Index might already exist or error:", e.message);
    }
    process.exit(0);
}
applyFix();
