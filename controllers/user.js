const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendOtp } = require('../utils/send_otp');
const config = require('../config/config');
const { io, sendEventToUser } = require('../utils/socketService'); // assuming `io` is imported from the socket.js file

// User Signup
exports.signup = async (req, res) => {
  try {
    const { name, email, password, id_card_selfie } = req.body;

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
    const { email, password } = req.body;

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
    [{ $match: { 'documentKey._id': userId } }],
    { fullDocument: 'updateLookup' } // Fetch the full document after an update
  );

  userChangeStream.on('change', (change) => {
    // Check if the fullDocument exists
    console.log('Change event received:', change);
    const updatedUser = change.fullDocument;

    if (updatedUser) {
      if (updatedUser.isUserVerified === true && updatedUser.rejection_reason === "") {
        // Emit socket event when 'isUserVerified' becomes true
        sendEventToUser(userId, 'isVerified', {
          isVerified: true,
          rejectionReason: ""
        });
      } else if (updatedUser.isUserVerified === false && updatedUser.rejection_reason !== "") {
        sendEventToUser(userId, 'isVerified', {
          isVerified: false,
          rejectionReason: updatedUser.rejection_reason
        });
      }
    } else {
      // Handle case where fullDocument is undefined
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
    const user = await User.findById(userId,);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'User profile fetched successfully', "user": {
        _id: user._id,
        name: user.name,
        email: user.email,
        profile_image: user.profile_image,
        isOtpVerified: true
    } });
  } catch (error) {
    res.status(500).json({ message: 'Error in updating user', error });
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