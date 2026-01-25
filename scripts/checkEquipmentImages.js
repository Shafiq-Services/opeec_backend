// Script to check equipment data in MongoDB
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function checkEquipmentImages() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get Equipment model
    const Equipment = mongoose.model('Equipment', new mongoose.Schema({}, { strict: false }), 'equipments');
    const Category = mongoose.model('Category', new mongoose.Schema({}, { strict: false }), 'categories');

    // Check all equipment
    const allEquipment = await Equipment.find({});
    console.log(`📦 Total equipment in database: ${allEquipment.length}`);
    
    // Check active equipment
    const activeEquipment = await Equipment.find({ equipment_status: 'Active' });
    console.log(`✅ Active equipment: ${activeEquipment.length}`);
    
    // Check equipment with different statuses
    const statuses = await Equipment.aggregate([
      { $group: { _id: '$equipment_status', count: { $sum: 1 } } }
    ]);
    console.log('\n📊 Equipment by status:');
    statuses.forEach(s => console.log(`   - ${s._id || 'null'}: ${s.count}`));

    // Check equipment with images
    const withImages = await Equipment.find({ 
      equipment_status: 'Active',
      images: { $exists: true, $ne: [], $type: 'array' }
    });
    console.log(`\n🖼️  Active equipment WITH images: ${withImages.length}`);
    
    // Check equipment without images
    const withoutImages = await Equipment.find({
      equipment_status: 'Active',
      $or: [
        { images: { $exists: false } },
        { images: [] },
        { images: null }
      ]
    });
    console.log(`❌ Active equipment WITHOUT images: ${withoutImages.length}`);

    // Sample some equipment with images
    if (withImages.length > 0) {
      console.log('\n📸 Sample equipment with images:');
      const sample = withImages.slice(0, 3);
      sample.forEach((eq, i) => {
        console.log(`\n   Equipment ${i + 1}: ${eq.name}`);
        console.log(`   - ID: ${eq._id}`);
        console.log(`   - Status: ${eq.equipment_status}`);
        console.log(`   - SubCategory ID: ${eq.subCategoryId}`);
        console.log(`   - Images count: ${eq.images?.length || 0}`);
        if (eq.images && eq.images.length > 0) {
          console.log(`   - First image: ${eq.images[0]?.substring(0, 80)}...`);
        }
      });
    }

    // Check categories and subcategories
    const categories = await Category.find({});
    console.log(`\n📂 Total categories: ${categories.length}`);
    
    let totalSubCategories = 0;
    categories.forEach(cat => {
      totalSubCategories += cat.sub_categories?.length || 0;
    });
    console.log(`📂 Total subcategories: ${totalSubCategories}`);

    // Check if equipment subcategories exist
    console.log('\n🔗 Checking subcategory references...');
    let validSubCatCount = 0;
    let invalidSubCatCount = 0;
    
    for (const eq of activeEquipment) {
      if (!eq.subCategoryId) {
        invalidSubCatCount++;
        continue;
      }
      
      // Find the subcategory
      let found = false;
      for (const cat of categories) {
        if (cat.sub_categories?.some(sub => sub._id.toString() === eq.subCategoryId?.toString())) {
          found = true;
          break;
        }
      }
      
      if (found) {
        validSubCatCount++;
      } else {
        invalidSubCatCount++;
        console.log(`   ❌ Equipment "${eq.name}" has invalid subCategoryId: ${eq.subCategoryId}`);
      }
    }
    
    console.log(`\n✅ Equipment with valid subcategory: ${validSubCatCount}`);
    console.log(`❌ Equipment with invalid/missing subcategory: ${invalidSubCatCount}`);

    // Final summary
    console.log('\n' + '='.repeat(50));
    console.log('📋 SUMMARY FOR RANDOM IMAGES API:');
    console.log('='.repeat(50));
    console.log(`Total Active Equipment: ${activeEquipment.length}`);
    console.log(`With Images: ${withImages.length}`);
    console.log(`With Valid Subcategory: ${validSubCatCount}`);
    console.log(`\n🎯 Equipment eligible for random images: ${Math.min(withImages.length, validSubCatCount)}`);
    
    if (withImages.length === 0) {
      console.log('\n⚠️  PROBLEM: No active equipment have images!');
    }
    if (validSubCatCount === 0) {
      console.log('\n⚠️  PROBLEM: No active equipment have valid subcategories!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

checkEquipmentImages();
