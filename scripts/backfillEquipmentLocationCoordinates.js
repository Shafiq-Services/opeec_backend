/**
 * Backfill location.coordinates (GeoJSON) from location.lat and location.lng
 * for equipments that have lat/lng but missing or invalid coordinates.
 * get_listing uses $geoNear on location.coordinates, so documents without
 * it are excluded from distance-based listing.
 *
 * Usage: node scripts/backfillEquipmentLocationCoordinates.js
 */

require('dotenv').config();
const path = require('path');

require(path.join(__dirname, '../config/config.js'));

const connectDB = require('../config/db');
const mongoose = require('mongoose');
const Equipment = require('../models/equipment');

if (!process.env.MONGO_URI) {
  console.error('MONGO_URI is required. Set it in .env');
  process.exit(1);
}

function hasValidCoordinates(loc) {
  return (
    loc &&
    loc.coordinates &&
    loc.coordinates.type === 'Point' &&
    Array.isArray(loc.coordinates.coordinates) &&
    loc.coordinates.coordinates.length === 2
  );
}

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await connectDB();
    console.log('Connected.\n');

    const equipments = await Equipment.find({
      'location.lat': { $exists: true, $ne: null },
      'location.lng': { $exists: true, $ne: null },
    }).lean();

    let updated = 0;
    for (const eq of equipments) {
      const loc = eq.location || {};
      const lat = loc.lat;
      const lng = loc.lng;
      if (lat == null || lng == null) continue;
      if (hasValidCoordinates(loc)) continue;

      const coordinates = {
        type: 'Point',
        coordinates: [Number(lng), Number(lat)],
      };

      await Equipment.updateOne(
        { _id: eq._id },
        { $set: { 'location.coordinates': coordinates } }
      );
      updated++;
      console.log(`Updated: ${eq.name} (${eq._id}) -> [${lng}, ${lat}]`);
    }

    console.log(`\nDone. Updated ${updated} of ${equipments.length} equipment.`);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

run();
