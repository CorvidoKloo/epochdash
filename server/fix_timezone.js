const { DB } = require('./src/database');
const env = { DATABASE_URL: 'postgresql://postgres.acetaaihaymgypibgqld:KillerFeeder890689!@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres' };

async function fixTimezone() {
    const db = new DB(env.DATABASE_URL);
    await db.initialize();
    const client = await db.pool.connect();
    
    try {
        await client.query("ALTER TABLE time_entries ALTER COLUMN start_time TYPE TIMESTAMP WITH TIME ZONE");
        await client.query("ALTER TABLE time_entries ALTER COLUMN end_time TYPE TIMESTAMP WITH TIME ZONE");
        await client.query("ALTER TABLE time_entries ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE");
        await client.query("ALTER TABLE screenshots ALTER COLUMN captured_at TYPE TIMESTAMP WITH TIME ZONE");
        console.log("Timezone columns fixed successfully!");
    } catch (e) {
        console.error("Error altering columns:", e);
    } finally {
        client.release();
    }
    
    process.exit(0);
}

fixTimezone().catch(console.error);
