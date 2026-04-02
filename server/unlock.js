const { DB } = require('./src/database');
const env = { DATABASE_URL: 'postgresql://postgres.acetaaihaymgypibgqld:KillerFeeder890689!@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres' };

async function unlockDb() {
    console.log("Connecting...");
    const db = new DB(env.DATABASE_URL);
    const client = await db.pool.connect();
    
    try {
        console.log("Checking locks...");
        const res = await client.query(`
            SELECT pid, state, query, wait_event_type, wait_event
            FROM pg_stat_activity 
            WHERE state != 'idle' AND pid != pg_backend_pid();
        `);
        console.log("Active transactions blocking:", res.rows);
        
        console.log("Killing other pids...");
        await client.query(`
            SELECT pg_terminate_backend(pid) 
            FROM pg_stat_activity 
            WHERE pid <> pg_backend_pid() 
            AND state in ('idle in transaction', 'active');
        `);
        console.log("Terminated idle transactions.");
    } catch (e) {
        console.error("Error:", e);
    } finally {
        client.release();
    }
    process.exit(0);
}

unlockDb().catch(console.error);
