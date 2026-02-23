const EquipmentDropdown = require('../models/equipmentDropDown');

// ✅ GET: Fetch All Dropdown Settings
const getEquipmentDropdowns = async (req, res) => {
    try {
      const dropdowns = await EquipmentDropdown.find({}, { _id: 0, __v: 0, createdAt: 0, updatedAt: 0 }).lean();
  
      // Reorder fields manually if needed: name → unit → options
      const reorderedDropdowns = dropdowns.map(dropdown => ({
        name: dropdown.name,
        unit: dropdown.unit,
        options: dropdown.options
      }));
  
      res.status(200).json({ message: 'Dropdowns fetched successfully.', data: reorderedDropdowns });
  
    } catch (error) {
      console.error('Error fetching dropdowns:', error);
      res.status(500).json({ message: 'Internal server error.', error: error.message });
    }
  };

// ✅ PUT: Modify (Create/Update) a Dropdown by Name
// Days-only rental system (Option A)
const updateEquipmentDropdown = async (req, res) => {
  const dropdowns = req.body; // now expecting an array

  try {
    if (!Array.isArray(dropdowns) || dropdowns.length === 0) {
      return res.status(400).json({ message: 'Dropdowns array is required.' });
    }

    // Days-only system - no hours/weeks/months
    const validUnits = ['days'];

    // Valid value ranges for each dropdown type
    const validRanges = {
      advanceNotice: [0, 1, 2, 3, 4, 5], // 0 = same-day allowed (with 5PM cutoff)
      minimumRentalDuration: [1, 2, 3, 4, 5],
      maximumRentalDuration: [1, 2, 3, 4, 5, 6, 7, 14, 30]
    };

    for (const dropdown of dropdowns) {
      const { name, unit, options } = dropdown;

      if (!name || !unit || !options || !Array.isArray(options)) {
        return res.status(400).json({ message: 'Each dropdown must have name, unit, and options array.' });
      }

      if (!validUnits.includes(unit)) {
        return res.status(400).json({ message: `Invalid unit type for ${name}. Only 'days' is supported.` });
      }

      // Validate option values are within allowed range
      const allowedValues = validRanges[name];
      if (allowedValues) {
        for (const option of options) {
          if (!allowedValues.includes(option.value)) {
            return res.status(400).json({ 
              message: `Invalid value ${option.value} for ${name}. Allowed values: ${allowedValues.join(', ')}` 
            });
          }
        }
      }

      for (const option of options) {
        if (!option.label || option.value === undefined || typeof option.recommended !== 'boolean') {
          return res.status(400).json({ message: `Each option inside ${name} must have label (string), value (number), and recommended (boolean).` });
        }
      }

      await EquipmentDropdown.findOneAndUpdate(
        { name },
        { unit, options },
        { new: true, upsert: true }
      );
    }

    res.status(200).json({ message: 'Dropdowns updated successfully.' });

  } catch (error) {
    console.error('Error updating dropdowns:', error);
    res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
};

module.exports = { getEquipmentDropdowns, updateEquipmentDropdown };
