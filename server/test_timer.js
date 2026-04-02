const { DB } = require('./src/database');
const env = { DATABASE_URL: 'postgresql://postgres.acetaaihaymgypibgqld:KillerFeeder890689!@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres' };

async function test() {
    const db = new DB(env.DATABASE_URL);
    await db.connect();
    
    // Find admin user
    const user = await db.getUserByEmail('admin@epochdash.local');
    console.log('User id:', user.id);
    
    // Check if a timer is running
    const running = await db.getRunningEntry(user.id);
    console.log('Currently running:', running);
    
    if (!running) {
        // Start a timer
        console.log('Starting timer...');
        await db.createTimeEntry(user.id, null, null, 'Test Timer', new Date().toISOString());
        const newRunning = await db.getRunningEntry(user.id);
        console.log('Now running:', newRunning);
    } else {
        // Stop the timer
        console.log('Stopping timer...');
        await db.stopTimeEntry(running.id, new Date().toISOString(), 60);
        console.log('Stopped.');
    }
    
    process.exit(0);
}
test().catch(console.error);
