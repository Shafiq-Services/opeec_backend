/**
 * Migration Script: Convert duration fields from nested objects to plain numbers
 * 
 * This script converts equipment duration fields from the old format:
 *   { dropdownId: ObjectId, selectedValue: 2, type: "days", count: 2 }
 * To the new simplified format:
 *   2 (plain number representing days)
 * 
 * Run: node scripts/migrateDurationFieldsToNumbers.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

// Helper: extract days value from duration field
function extractDays(value, defaultValue = 0) {
  if (value == null) return defaultValue;
  if (typeof value === 'number') return value;
  if (typeof value === 'object') {
    return value.selectedValue ?? value.count ?? defaultValue;
  }
  return defaultValue;
}

async function migrate() {
  console.log('🔄 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;
  const equipmentCollection = db.collection('equipments');

  // Find all equipment documents
  const equipments = await equipmentCollection.find({}).toArray();
  console.log(`📦 Found ${equipments.length} equipment documents`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const equipment of equipments) {
    try {
      const noticePeriod = extractDays(equipment.notice_period, 0);
      const minTrip = extractDays(equipment.minimum_trip_duration, 1);
      const maxTrip = extractDays(equipment.maximum_trip_duration, 0);

      // Check if already migrated (values are already numbers)
      const alreadyMigrated = 
        typeof equipment.notice_period === 'number' &&
        typeof equipment.minimum_trip_duration === 'number' &&
        typeof equipment.maximum_trip_duration === 'number';

      if (alreadyMigrated) {
        skipped++;
        continue;
      }

      // Update to plain numbers
      await equipmentCollection.updateOne(
        { _id: equipment._id },
        {
          $set: {
            notice_period: noticePeriod,
            minimum_trip_duration: minTrip,
            maximum_trip_duration: maxTrip
          }
        }
      );

      updated++;
      console.log(`  ✅ ${equipment.name}: notice=${noticePeriod}, min=${minTrip}, max=${maxTrip}`);
    } catch (err) {
      errors++;
      console.error(`  ❌ Error updating ${equipment.name}:`, err.message);
    }
  }

  console.log('\n📊 Migration Summary:');
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped (already migrated): ${skipped}`);
  console.log(`   Errors: ${errors}`);

  await mongoose.disconnect();
  console.log('\n✅ Migration complete');
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
