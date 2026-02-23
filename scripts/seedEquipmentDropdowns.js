/**
 * Seed Equipment Dropdowns with Days-Only Options (Option A)
 * 
 * This script populates the equipmentdropdowns collection with the correct
 * day-only options for the simplified rental system.
 * 
 * Run: node scripts/seedEquipmentDropdowns.js
 */

require('dotenv').config();
const path = require('path');

// Load config so MONGO_URI is set
require(path.join(__dirname, '../config/config.js'));

const connectDB = require('../config/db');
const mongoose = require('mongoose');
const EquipmentDropdown = require('../models/equipmentDropDown');

if (!process.env.MONGO_URI) {
  console.error('MONGO_URI is required. Set it in .env or config');
  process.exit(1);
}

// Days-only dropdown configurations
const dropdownConfigs = [
  {
    name: 'advanceNotice',
    unit: 'days',
    options: [
      { label: 'Same Day (before 5 PM)', value: 0, recommended: true },
      { label: '1 Day', value: 1, recommended: false },
      { label: '2 Days', value: 2, recommended: false },
      { label: '3 Days', value: 3, recommended: false },
      { label: '4 Days', value: 4, recommended: false },
      { label: '5 Days', value: 5, recommended: false },
    ]
  },
  {
    name: 'minimumRentalDuration',
    unit: 'days',
    options: [
      { label: '1 Day', value: 1, recommended: true },
      { label: '2 Days', value: 2, recommended: false },
      { label: '3 Days', value: 3, recommended: false },
      { label: '4 Days', value: 4, recommended: false },
      { label: '5 Days', value: 5, recommended: false },
    ]
  },
  {
    name: 'maximumRentalDuration',
    unit: 'days',
    options: [
      { label: '1 Day', value: 1, recommended: false },
      { label: '2 Days', value: 2, recommended: false },
      { label: '3 Days', value: 3, recommended: false },
      { label: '4 Days', value: 4, recommended: false },
      { label: '5 Days', value: 5, recommended: false },
      { label: '6 Days', value: 6, recommended: false },
      { label: '7 Days (1 Week)', value: 7, recommended: true },
      { label: '14 Days (2 Weeks)', value: 14, recommended: false },
      { label: '30 Days (1 Month)', value: 30, recommended: false },
    ]
  }
];

async function seedDropdowns() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await connectDB();
    console.log('✅ Connected to MongoDB');

    console.log('\n📦 Seeding equipment dropdowns (Days-only system)...\n');

    for (const config of dropdownConfigs) {
      const result = await EquipmentDropdown.findOneAndUpdate(
        { name: config.name },
        { 
          unit: config.unit, 
          options: config.options 
        },
        { new: true, upsert: true }
      );
      
      console.log(`✅ ${config.name}:`);
      console.log(`   Unit: ${config.unit}`);
      console.log(`   Options: ${config.options.map(o => o.label).join(', ')}`);
      console.log('');
    }

    console.log('🎉 Equipment dropdowns seeded successfully!\n');

    // Display summary
    const allDropdowns = await EquipmentDropdown.find({}).lean();
    console.log('📊 Current Dropdown Configuration:');
    console.log('─'.repeat(50));
    for (const dropdown of allDropdowns) {
      console.log(`\n${dropdown.name} (${dropdown.unit}):`);
      dropdown.options.forEach(opt => {
        const rec = opt.recommended ? ' ⭐' : '';
        console.log(`  • ${opt.label} = ${opt.value}${rec}`);
      });
    }

  } catch (error) {
    console.error('❌ Error seeding dropdowns:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

seedDropdowns();
