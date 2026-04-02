const { DB } = require('./src/database');

async function init() {
    const db = new DB('postgresql://postgres.acetaaihaymgypibgqld:KillerFeeder890689!@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres');
    console.log('Connecting and initializing...');
    await db.initialize();
    console.log('Done!');
    process.exit(0);
}

init().catch(console.error);
