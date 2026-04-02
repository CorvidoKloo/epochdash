const { DB } = require('./src/database');
const env = { DATABASE_URL: 'postgresql://postgres.acetaaihaymgypibgqld:KillerFeeder890689!@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres' };

async function clean() {
    const db = new DB(env.DATABASE_URL);
    await db.connect();
    
    // Stop ALL running timers with duration 0
    await db.pool.query("UPDATE time_entries SET is_running = 0, duration = 0, end_time = NOW() WHERE is_running = 1");
    console.log("Cleared all running timers");
    
    const user = await db.getUserByEmail('admin@epochdash.local');
    
    // 1. Start timer
    const startStr = new Date().toISOString();
    const result = await db.createTimeEntry(user.id, null, null, 'Test bug', startStr);
    console.log("Created timer with start_time:", result.start_time);
    console.log("typeof start_time:", typeof result.start_time);
    
    // 2. Mock /timer/stop logic exactly as in route
    const running = await db.getRunningEntry(user.id);
    
    // Add brief delay
    await new Promise(r => setTimeout(r, 2000));
    
    const endTime = new Date().toISOString();
    const start = new Date(running.start_time);
    const end = new Date(endTime);
    const duration = Math.round((end - start) / 1000);
    
    console.log("Calc duration:", duration);
    console.log("start:", start);
    console.log("end:", end);
    
    await db.stopTimeEntry(running.id, endTime, duration);
    console.log("Stopped. Check if it's still running:");
    const chk = await db.getRunningEntry(user.id);
    console.log(chk ? "STILL RUNNING" : "PROPERLY STOPPED");
    process.exit(0);
}
clean().catch(console.error);
