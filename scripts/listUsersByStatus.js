/**
 * Script to list users by verification and bank connection status
 * Usage: node scripts/listUsersByStatus.js
 */

const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://opeecuser:4aGN7vh7e5nOz3aa@opeeccluster.pb7dv.mongodb.net/your_database?retryWrites=true&w=majority';

const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', userSchema);

async function listUsers() {
  console.log('📡 Connecting to MongoDB...');
  
  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
  });
  
  console.log('✅ Connected!\n');

  const users = await User.find({}, {
    email: 1,
    password: 1,
    name: 1,
    'stripe_verification.status': 1,
    'stripe_connect.account_status': 1,
    'stripe_connect.account_id': 1,
    isUserVerified: 1
  }).lean();

  const bothDone = users.filter(u => 
    u.stripe_verification?.status === 'verified' && 
    u.stripe_connect?.account_status === 'active'
  );

  const oneDone = users.filter(u => 
    (u.stripe_verification?.status === 'verified' && u.stripe_connect?.account_status !== 'active') ||
    (u.stripe_verification?.status !== 'verified' && u.stripe_connect?.account_status === 'active')
  );

  const noneDone = users.filter(u => 
    u.stripe_verification?.status !== 'verified' && 
    u.stripe_connect?.account_status !== 'active'
  );

  console.log('═'.repeat(80));
  console.log('  CATEGORY 1: ✅ BOTH VERIFIED + BANK CONNECTED (' + bothDone.length + ' users)');
  console.log('═'.repeat(80));
  bothDone.forEach(u => {
    console.log(`  📧 ${u.email}`);
    console.log(`     🔑 Password: ${u.password || 'N/A (hashed or not stored)'}`);
    console.log(`     👤 Name: ${u.name || 'N/A'}`);
    console.log(`     ✅ Verified: ${u.stripe_verification?.status}`);
    console.log(`     🏦 Bank: ${u.stripe_connect?.account_status}`);
    console.log('');
  });

  console.log('\n' + '═'.repeat(80));
  console.log('  CATEGORY 2: ⚠️ ONE DONE (' + oneDone.length + ' users)');
  console.log('═'.repeat(80));
  oneDone.forEach(u => {
    console.log(`  📧 ${u.email}`);
    console.log(`     🔑 Password: ${u.password || 'N/A (hashed or not stored)'}`);
    console.log(`     👤 Name: ${u.name || 'N/A'}`);
    console.log(`     ${u.stripe_verification?.status === 'verified' ? '✅' : '❌'} Verified: ${u.stripe_verification?.status || 'not_verified'}`);
    console.log(`     ${u.stripe_connect?.account_status === 'active' ? '✅' : '❌'} Bank: ${u.stripe_connect?.account_status || 'not_connected'}`);
    console.log('');
  });

  console.log('\n' + '═'.repeat(80));
  console.log('  CATEGORY 3: ❌ NONE DONE (' + noneDone.length + ' users)');
  console.log('═'.repeat(80));
  noneDone.forEach(u => {
    console.log(`  📧 ${u.email}`);
    console.log(`     🔑 Password: ${u.password || 'N/A (hashed or not stored)'}`);
    console.log(`     👤 Name: ${u.name || 'N/A'}`);
    console.log(`     ❌ Verified: ${u.stripe_verification?.status || 'not_verified'}`);
    console.log(`     ❌ Bank: ${u.stripe_connect?.account_status || 'not_connected'}`);
    console.log('');
  });

  console.log('\n' + '═'.repeat(80));
  console.log('  SUMMARY');
  console.log('═'.repeat(80));
  console.log(`  Total users: ${users.length}`);
  console.log(`  ✅ Both done: ${bothDone.length}`);
  console.log(`  ⚠️ One done: ${oneDone.length}`);
  console.log(`  ❌ None done: ${noneDone.length}`);
  console.log('═'.repeat(80));

  await mongoose.disconnect();
  console.log('\n📡 Disconnected from MongoDB');
}

listUsers().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
