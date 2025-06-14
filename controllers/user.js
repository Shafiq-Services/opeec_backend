const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { sendOtp } = require('../utils/send_otp');
const config = require('../config/config');
const { io, sendEventToUser } = require('../utils/socketService'); // assuming `io` is imported from the socket.js file
const Equipment = require('../models/equipment'); // Import the Equipment model
const { getAverageRating, getEquipmentRatingsList, getUserAverageRating, getSellerReviews } = require("../utils/common_methods");
const Order = require('../models/orders'); // Import the Order model
const mongoose = require('mongoose');

// User Signup
exports.signup = async (req, res) => {
  try {
    const { name, email, password, id_card_selfie, phone_number } = req.body;

    // Check if the email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email is already registered' });
    }
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const user = new User({
      name,
      email,
      password: hashedPassword,
      verified: false,
      id_card_selfie,
      phone_number,
      isUserVerified: false,
      rejection_reason: ''
    });

    await user.save();
    await sendOtp(email);

    // Return success message
    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error in signup', error });
  }
};

// User Login
exports.login = async (req, res) => {
  try {
    const { email, password, fcm_token } = req.body;

    if(!fcm_token)
    {
      return res.status(400).json({ message: 'FCM token is required' });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (user.isOtpVerified === false) {
      return res.status(400).json({ message: 'User is not verified' });
    }

    if (user.isUserVerified !== true) {
      user.isUserVerified = false;
      await user.save();
    }    

    if (!user.rejection_reason) {
      user.rejection_reason = '';
      await user.save();
    }    
    
      // Generate JWT token
      user.fcm_token = fcm_token; 
      await user.save();
    const token = jwt.sign({ userId: user._id }, config.JWT_SECRET);

    // Start monitoring user changes
    startUserMonitoring(user._id);

    res.status(200).json({ message: 'Login successful', token, _id: user._id, isUserVerified: user.isUserVerified, rejectionReason: user.rejection_reason });
  } catch (error) {
    res.status(500).json({ message: 'Error in login', error });
  }
};

const startUserMonitoring = (userId) => {
  const userChangeStream = User.watch(
    [
      {
        $match: {
          'documentKey._id': userId,
          'updateDescription.updatedFields': { $exists: true }, // Ensure fields are updated
          $or: [
            { 'updateDescription.updatedFields.isUserVerified': { $exists: true } },
            { 'updateDescription.updatedFields.rejection_reason': { $exists: true } },
            { 'updateDescription.updatedFields.is_blocked': { $exists: true } }
          ]
        }
      }
    ],
    { fullDocument: 'updateLookup' } // Fetch full document after update
  );

  userChangeStream.on('change', (change) => {
    console.log('Relevant Change detected:', change);
    const updatedUser = change.fullDocument;

    if (updatedUser) {
      if (updatedUser.isUserVerified === true && updatedUser.rejection_reason === "") {
        // Emit socket event when user is verified
        sendEventToUser(userId, 'isVerified', {
          isVerified: true,
          rejection_reason: ""
        });
      } else if (updatedUser.isUserVerified === false && updatedUser.rejection_reason !== "") {
        sendEventToUser(userId, 'isVerified', {
          isVerified: false,
          rejection_reason: updatedUser.rejection_reason
        });
      }

      sendEventToUser(userId, 'isBlocked', { isBlocked: updatedUser.is_blocked });

    } else {
      console.error("Change document is undefined", change);
    }
  });
};


// Send OTP to email
exports.sendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    // Send OTP to email
    const otp = await sendOtp(email);

    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error in sending OTP', error });
  }
};

exports.getFCMToken = async (req, res) => {
  const { userId } = req.query;

  try {
    // Find the user by email
    const user = await User.findOne({ _id: userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'FCM token retrieved successfully', fcmToken: user.fcm_token });
  }
    catch (error) {
    res.status(500).json({ message: 'Error in updating FCM token', error });
  }
};

// Verify OTP
exports.verifyUserOtp = async (req, res) => {
  const { email, otp } = req.body;

  try {
    // Find the user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    // Check if OTP exists and is not expired
    if (!user.otp || user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Verify the OTP
    if (user.otp !== parseInt(otp)) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // OTP verified, update the user to set isOtpVerified and remove OTP
    await User.updateOne({ email }, { 
      $set: { isOtpVerified: true },
      $unset: { otp: 1, otpExpiry: 1 } // Remove OTP and expiry fields
    });

    return res.status(200).json({ message: 'OTP verified successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong.', error });
  }
};

// Update User Profile
exports.updateUser = async (req, res) => {
  try {
    const userId = req.userId;    
    const { name, profileImage } = req.body;

    // Find user by ID and update profile
    const user = await User.findByIdAndUpdate(
      userId,
      { name, profile_image: profileImage },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'User updated successfully', "user" : {name: user.name, profileImage: user.profile_image} });
  } catch (error) {
    res.status(500).json({ message: 'Error in updating user', error });
  }
};

// Update User Profile
exports.getprofile = async (req, res) => {
  try {
    const userId = req.userId;    

    // Find user by ID and update profile
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const average_rating = await getUserAverageRating(userId);
    const reviews = await getSellerReviews(userId);
    res.status(200).json({ message: 'User profile fetched successfully', "user": {
        _id: user._id,
        name: user.name,
        email: user.email,
        profile_image: user.profile_image,
        isOtpVerified: user.isOtpVerified,
        average_rating: average_rating,
        reviews: reviews,
    } });
  } catch (error) {
    res.status(500).json({ message: 'Error in getting user profile', error });
  }
};

// Reset Password with OTP
exports.forgotOrResetPasswordOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Validate OTP and reset password logic here (similar to verifyUserOtp)
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    
    // Check if OTP exists and is not expired
    if (!user.otp || user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Verify the OTP
    if (user.otp !== parseInt(otp)) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // OTP verified, update the user to set isOtpVerified and remove OTP
    await User.updateOne({ email }, { 
      $set: { isOtpVerified: true },
      $unset: { otp: 1, otpExpiry: 1 } // Remove OTP and expiry fields
    });

    return res.status(200).json({ message: 'OTP verified successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error in resetting password', error });
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const { email, new_password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(new_password, 10);

    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ message: 'Error in resetting password', error });
  }
};

exports.resendIdCardSelfie = async (req, res) => {
  const { id_card_selfie } = req.body;

  try {
    console.log(id_card_selfie);
    const userId = req.userId;
    console.log(userId);
    const user = await User.findById(userId);
    console.log("user");
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if the user is already verified
    if (user.isUserVerified) {
      return res.status(200).json({ message: 'User is already verified' });
    }

    user.id_card_selfie = id_card_selfie;
    user.isUserVerified = false;
    user.rejection_reason = '';
    await user.save();

    res.status(200).json({ message: 'Verification request sent successfully' });
  }
  catch (error) {
    res.status(500).json({ message: 'Error in resending ID card selfie', error });
  }
};



///////////////////Admin//////////////////////////

// Approve New User
exports.approveUser = async (req, res) => {
  try {
    const { userId } = req.query;

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Approve user
    user.isUserVerified = true;
    user.rejection_reason = ''; // Clear any previous rejection reason
    await user.save();

    // Send real-time event notification to the user
    sendEventToUser(userId, 'isVerified', {
      isVerified: true,
      rejection_reason: "",
    });

    res.status(200).json({ message: 'User approved successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error approving user', error });
  }
};

// Reject User with Reason
exports.rejectUser = async (req, res) => {
  try {
    const { userId } = req.query;
    const { rejection_reason } = req.body;

    if (!rejection_reason) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Reject user
    user.isUserVerified = false;
    user.rejection_reason = rejection_reason;
    await user.save();

    // Send real-time event notification to the user
    sendEventToUser(userId, 'isVerified', {
      isVerified: false,
      rejection_reason: rejection_reason,
    });

    res.status(200).json({ message: 'User rejected successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error rejecting user', error });
  }
};

// Block User with Reason
exports.blockUser = async (req, res) => {
  try {
    const { userId } = req.query;
    const { block_reason } = req.body;

    if (!block_reason) {
      return res.status(400).json({ message: 'Block reason is required' });
    }

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Block user
    user.is_blocked = true;
    user.block_reason = block_reason;
    await user.save();

    // Send real-time event notification to the user
    sendEventToUser(userId, 'isBlocked', {
      message: `Your account has been blocked due to: ${block_reason}`,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({ message: 'User blocked successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error blocking user', error });
  }
};

exports.unBlockUser = async (req, res) => {
  try {
    const { userId } = req.query;

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Approve user
    user.is_blocked = false;
    user.block_reason = ''; // Clear any previous block reason
    await user.save();

    // Send real-time event notification to the user
    sendEventToUser(userId, 'isBlocked', {
      is_blocked: false,
      block_reason: "",
    });

    res.status(200).json({ message: 'User unblocked successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error unblocking user', error });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const { status = 'all' } = req.query;
    
    // First get all users who own equipment
    const users = await User.find();
    
    // Get all equipment owners
    const equipmentOwners = await Equipment.distinct('owner_id');
    
    // Filter users to only include equipment owners
    let sellers = users.filter(user => 
      equipmentOwners.some(ownerId => ownerId.toString() === user._id.toString())
    );

    // Filter based on status (case-insensitive)
    if (status.toLowerCase() !== 'all') {
      sellers = sellers.filter(seller => {
        switch (status.toLowerCase()) {
          case 'pending':
            return !seller.isUserVerified;
          case 'active':
            return seller.isUserVerified && !seller.is_blocked;
          case 'blocked':
            return seller.is_blocked;
          default:
            return true;
        }
      });
    }
    
    // Get equipment counts and rental counts for each seller
    const sellersWithStats = await Promise.all(sellers.map(async (seller) => {
      // Get equipment count
      const equipmentCount = await Equipment.countDocuments({ owner_id: seller._id });
      
      // Get total rentals count
      const sellerEquipments = await Equipment.find({ owner_id: seller._id });
      const totalRentals = await Order.countDocuments({ 
        equipment_id: { $in: sellerEquipments.map(eq => eq._id) }
      });
      
      // Return only required fields
      return {
        _id: seller._id,
        name: seller.name,
        email: seller.email,
        profile_image: seller.profile_image,
        id_card_selfie: seller.id_card_selfie,
        equipment_count: equipmentCount,
        total_rentals: totalRentals,
        is_blocked: seller.is_blocked,
        block_reason: seller.block_reason,
        created_at: seller.created_at
      };
    }));

    res.status(200).json({ 
      message: 'Users fetched successfully', 
      users: sellersWithStats 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users', error });
  }
}

// Search users based on text query
exports.searchUsers = async (req, res) => {
  try {
    const { text } = req.query;
    if (!text) {
      return res.status(400).json({ message: 'Search text is required' });
    }
    const searchPattern = new RegExp(text, 'i');
    const orQuery = [
      { name: { $regex: searchPattern } },
      { email: { $regex: searchPattern } }
    ];
    if (mongoose.Types.ObjectId.isValid(text)) {
      orQuery.push({ _id: text });
    }
    // Find all users matching name, email, or exact id
    let users = await User.find({ $or: orQuery }).select('-password -otp -otpExpiry');
    // If not an exact ObjectId, also filter for partial _id match
    if (!mongoose.Types.ObjectId.isValid(text)) {
      const textLower = text.toLowerCase();
      users = users.concat(
        (await User.find().select('-password -otp -otpExpiry')).filter(u =>
          u._id.toString().toLowerCase().includes(textLower)
        )
      );
      // Remove duplicates
      users = users.filter((u, i, arr) => arr.findIndex(x => x._id.toString() === u._id.toString()) === i);
    }
    res.status(200).json({ message: 'Users fetched successfully', users });
  } catch (error) {
    console.error("🔴 Error in searchUsers:", error);
    res.status(500).json({ message: 'Error searching users', error });
  }
};
