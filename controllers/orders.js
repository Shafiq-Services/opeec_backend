  const Equipments = require('../models/equipment');
  const Orders = require('../models/orders');

// Add Order
exports.addOrder = async (req, res) => {
  try {
    const user_id = req.userId; // Extracted from auth middleware
    const {
      equipment_id,
      start_date,
      end_date,
      delivery_address,
      address,
      lat,
      long,
      total_rent,
      security_fee,
    } = req.body;

    // Validation: Check required fields
    const requiredFields = [
      { name: 'equipment_id', value: equipment_id },
      { name: 'start_date', value: start_date },
      { name: 'end_date', value: end_date },
      { name: 'delivery_address', value: delivery_address },
      { name: 'address', value: address },
      { name: 'lat', value: lat },
      { name: 'long', value: long },
      { name: 'total_rent', value: total_rent },
    ];

    for (const field of requiredFields) {
      if (!field.value) {
        return res.status(400).json({ message: `${field.name} is required.` });
      }
    }

    // Check if equipment exists
    const equipment = await Equipments.findById(equipment_id);
    if (!equipment) {
      return res.status(404).json({
        message: 'Equipment not found',
        status: false,
      });
    }

    // Create new order
    const newOrder = new Orders({
      user_id,
      equipment_id,
      rental_schedule: {
        start_date: new Date(start_date),
        end_date: new Date(end_date),
      },
      location: {
        address,
        lat,
        long,
      },
      total_amount: total_rent,
      security_fee: security_fee?.cost || 0,
      cancellation: {
        is_cancelled: false,
      },
      rental_status: 'Booked',
      return_status: {
        is_returned: false,
      },
    });

    // Save order to database
    await newOrder.save();

    // Response with order details
    return res.status(201).json({
      message: 'Order created successfully',
      status: true,
      order: {
        order_id: newOrder._id,
        user_id: newOrder.user_id,
        equipment_id: newOrder.equipment_id,
        rental_schedule: newOrder.rental_schedule,
        location: newOrder.location,
        total_amount: newOrder.total_amount,
        security_fee: newOrder.security_fee,
        rental_status: newOrder.rental_status,
        return_status: newOrder.return_status,
        created_at: newOrder.created_at,
      },
    });
  } catch (err) {
    console.error('Error creating order:', err);
    return res.status(500).json({
      message: 'Server error',
      status: false,
    });
  }
};

exports.getRentedEquipments = async (req, res) => {
  try {
      const user_id = req.userId; // Assuming user ID is retrieved from authenticated user

      // Query with populate and transformation
      const rentedEquipments = await Orders.find({ user_id: user_id })
          .populate('equipment_id', 'name description rental_price') // Populate specific fields
          .lean(); // Convert to plain JavaScript objects

        // Transform the result to keep `equipment_id` and include `equipment`
        const transformedData = rentedEquipments.map(order => {
          const {
              _id, // Order ID
              user_id,
              equipment_id, // Populated equipment object
              rental_schedule,
              location,
              total_amount,
              security_fee,
              rental_status,
              cancellation,
              return_status,
              created_at,
              updated_at
          } = order;

          // Calculate the number of days between rental start and end date
          const startDate = new Date(rental_schedule.start_date);
          const endDate = new Date(rental_schedule.end_date);
          const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)); // Difference in days

          // Calculate rental amounts
          const perday_rent = equipment_id?.rental_price || 0;
          const total_rent = perday_rent * days;
          
          return {
            _id,
            equipment_id: equipment_id?._id, // Keep equipment_id as ID
            equipment: equipment_id, // Include populated equipment details
            rental_schedule,
            location: location.address,
            rental_amount: {
              days, // The number of rental days
              perday_rent,
              total_rent,
              protection_money: security_fee,
              total_amount: total_amount,
            },
            rental_status,
            created_at,
            updated_at
          };
      });

      // Return the response
      res.json({
          message: "Rented equipment retrieved successfully.",
          status: true,
          data: transformedData,
      });
  } catch (error) {
      console.error("Error retrieving rented equipment:", error);
      res.status(500).json({
          message: "Failed to retrieve rented equipment.",
          status: false,
          error: error.message,
      });
  }
};
