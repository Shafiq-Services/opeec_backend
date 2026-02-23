/**
 * Fix equipment documents where location.coordinates is stored as [latitude, longitude]
 * instead of GeoJSON standard [longitude, latitude]. Such documents cause $geoNear to
 * index points in the wrong place and return empty results for location-based listing.
 *
 * Uses location.lat and location.lng to detect wrong order: if coordinates[0] === lat
 * and coordinates[1] === lng, rewrite to [lng, lat].
 *
 * Usage: node scripts/fixEquipmentCoordinatesOrder.js
 */

require('dotenv').config();
const path = require('path');
require(path.join(__dirname, '../config/config.js'));

const connectDB = require('../config/db');
const mongoose = require('mongoose');
const Equipment = require('../models/equipment');

const config = require('../config/config');
if (!config.MONGO_URI) {
  console.error('MONGO_URI is required. Set it in .env');
  process.exit(1);
}

function hasCoordinates(loc) {
  return (
    loc &&
    loc.coordinates &&
    Array.isArray(loc.coordinates.coordinates) &&
    loc.coordinates.coordinates.length === 2
  );
}

function isWrongOrder(loc) {
  if (!loc || loc.lat == null || loc.lng == null) return false;
  if (!hasCoordinates(loc)) return false;
  const [c0, c1] = loc.coordinates.coordinates;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  // GeoJSON is [longitude, latitude]. If stored as [lat, lng], first equals lat, second equals lng.
  const looksLikeLatLngOrder = Math.abs(c0 - lat) < 1e-6 && Math.abs(c1 - lng) < 1e-6;
  return looksLikeLatLngOrder;
}

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await connectDB();
    console.log('Connected.\n');

    const equipments = await Equipment.find({
      'location.lat': { $exists: true, $ne: null },
      'location.lng': { $exists: true, $ne: null },
      'location.coordinates.coordinates': { $exists: true, $size: 2 },
    }).lean();

    let updated = 0;
    for (const eq of equipments) {
      const loc = eq.location || {};
      if (!isWrongOrder(loc)) continue;

      const lat = Number(loc.lat);
      const lng = Number(loc.lng);
      const coordinates = {
        type: 'Point',
        coordinates: [lng, lat], // GeoJSON: [longitude, latitude]
      };

      await Equipment.updateOne(
        { _id: eq._id },
        { $set: { 'location.coordinates': coordinates } }
      );
      updated++;
      console.log(`Fixed: ${eq.name} (${eq._id}) -> [lng=${lng}, lat=${lat}]`);
    }

    console.log(`\nDone. Corrected ${updated} of ${equipments.length} equipment with wrong coordinate order.`);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

run();
