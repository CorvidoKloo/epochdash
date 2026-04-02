const { DB } = require('./src/database');
const env = { DATABASE_URL: 'postgresql://postgres.acetaaihaymgypibgqld:KillerFeeder890689!@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres' };

async function diagnose() {
    const db = new DB(env.DATABASE_URL);
    await db.connect();
    
    console.log('--- DB SETTINGS ---');
    const settings = await db.getSettings();
    console.log(JSON.stringify(settings, null, 2));
    
    console.log('\n--- S3 ENV VARS (STUB) ---');
    console.log('EPC_S3_REGION:', process.env.EPC_S3_REGION || 'NOT SET');
    console.log('EPC_S3_BUCKET:', process.env.EPC_S3_BUCKET || 'NOT SET');
    console.log('EPC_S3_KEY_ID:', process.env.EPC_S3_KEY_ID ? 'SET (starts with ' + process.env.EPC_S3_KEY_ID.substring(0, 4) + ')' : 'NOT SET');
    
    process.exit(0);
}
diagnose().catch(console.error);
