/**
 * Backfill equipment duration fields (notice_period, minimum_trip_duration, maximum_trip_duration)
 * so they use parent dropdown _id + selectedValue and resolve correctly in API responses.
 *
 * - Documents with no dropdownId (or only type/count) get sensible defaults.
 * - Legacy type+count is converted to dropdownId+selectedValue where possible.
 *
 * Usage: node scripts/backfillEquipmentDurations.js
 */

require('dotenv').config();
const path = require('path');

// Load config so MONGO_URI is set
require(path.join(__dirname, '../config/config.js'));

const connectDB = require('../config/db');
const mongoose = require('mongoose');
const Equipment = require('../models/equipment');
const EquipmentDropdown = require('../models/equipmentDropDown');

if (!process.env.MONGO_URI) {
  console.error('MONGO_URI is required. Set it in .env');
  process.exit(1);
}

function hasValidDropdownRef(ref, expectedDropdownId) {
  if (!ref || !ref.dropdownId || (ref.selectedValue === undefined || ref.selectedValue === null))
    return false;
  if (expectedDropdownId && String(ref.dropdownId) !== String(expectedDropdownId)) return false;
  return true;
}

function needsUpdate(equipment, ids) {
  return (
    !hasValidDropdownRef(equipment.notice_period, ids.advanceId) ||
    !hasValidDropdownRef(equipment.minimum_trip_duration, ids.minId) ||
    !hasValidDropdownRef(equipment.maximum_trip_duration, ids.maxId)
  );
}

/**
 * Find best matching option value for a dropdown (by type + count).
 * Returns the option value to use as selectedValue, or defaultVal if no match.
 */
function valueFromTypeCount(dropdown, type, count, defaultVal) {
  if (count === undefined || count === null || count === 0) return defaultVal;
  const unit = (dropdown.unit || '').toLowerCase();
  const t = (type || '').toLowerCase();
  let targetValue = count;
  if (unit === 'hours' && (t === 'day' || t === 'days')) targetValue = count * 24;
  else if (unit === 'days' && (t === 'week' || t === 'weeks')) targetValue = count * 7;
  else if (unit === 'days' && (t === 'month' || t === 'months')) targetValue = count * 30;
  const options = dropdown.options || [];
  const exact = options.find((o) => o.value === targetValue);
  if (exact) return exact.value;
  let bestVal = defaultVal;
  for (const o of options) {
    if (Math.abs(o.value - targetValue) < Math.abs(bestVal - targetValue)) bestVal = o.value;
  }
  return bestVal;
}

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await connectDB();
    console.log('Connected.\n');

    const advanceNotice = await EquipmentDropdown.findOne({ name: 'advanceNotice' }).lean();
    const minimumRental = await EquipmentDropdown.findOne({ name: 'minimumRentalDuration' }).lean();
    const maximumRental = await EquipmentDropdown.findOne({ name: 'maximumRentalDuration' }).lean();

    if (!advanceNotice || !minimumRental || !maximumRental) {
      console.error('Missing dropdowns. Ensure advanceNotice, minimumRentalDuration, maximumRentalDuration exist.');
      process.exit(1);
    }

    const ids = {
      advanceId: advanceNotice._id,
      minId: minimumRental._id,
      maxId: maximumRental._id,
    };

    const defaultNoticeValue = 5;   // 5 hours
    const defaultMinValue = 1;     // 1 day
    const defaultMaxValue = 7;     // 1 week

    const equipments = await Equipment.find({}).lean();
    let updated = 0;

    for (const eq of equipments) {
      if (!needsUpdate(eq, ids)) continue;

      const notice = eq.notice_period || {};
      const minTrip = eq.minimum_trip_duration || {};
      const maxTrip = eq.maximum_trip_duration || {};

      const noticeValue = hasValidDropdownRef(notice, ids.advanceId)
        ? notice.selectedValue
        : valueFromTypeCount(advanceNotice, notice.type, notice.count, defaultNoticeValue);
      const minValue = hasValidDropdownRef(minTrip, ids.minId)
        ? minTrip.selectedValue
        : valueFromTypeCount(minimumRental, minTrip.type, minTrip.count, defaultMinValue);
      const maxValue = hasValidDropdownRef(maxTrip, ids.maxId)
        ? maxTrip.selectedValue
        : valueFromTypeCount(maximumRental, maxTrip.type, maxTrip.count, defaultMaxValue);

      await Equipment.updateOne(
        { _id: eq._id },
        {
          $set: {
            notice_period: { dropdownId: ids.advanceId, selectedValue: noticeValue },
            minimum_trip_duration: { dropdownId: ids.minId, selectedValue: minValue },
            maximum_trip_duration: { dropdownId: ids.maxId, selectedValue: maxValue },
          },
        }
      );

      updated++;
      console.log(`Updated: ${eq.name} (${eq._id}) -> notice=${noticeValue}, min=${minValue}, max=${maxValue}`);
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
