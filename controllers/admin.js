const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/admin');
const config = require('../config/config');
const { sendOtp } = require('../utils/send_otp');

// Admin Signup
exports.signup = async (req, res) => {
  try {
    const { name, email, password, mobile, age, location, about, profile_picture } = req.body;

    // Check if the email already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Email is already registered' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new admin
    const admin = new Admin({
      name,
      email,
      mobile,
      age,
      location,
      about,
      password: hashedPassword,
      profile_picture,
    });

    await admin.save();

    // Return success message
    res.status(201).json({ message: 'Admin account created successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error in admin signup', error });
  }
};

// Admin Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find admin by email
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign({ adminId: admin._id }, config.JWT_SECRET);

    res.status(200).json({
      message: 'Admin login successful',
      token,
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        mobile: admin.mobile,
        profile_picture: admin.profile_picture,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Error in admin login', error });
  }
};

// Get Admin Profile
exports.getProfile = async (req, res) => {
  try {
    const adminId = req.adminId; // Retrieved from middleware

    // Find admin by ID
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.status(200).json({
      message: 'Admin profile fetched successfully',
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        mobile: admin.mobile,
        age: admin.age,
        location: admin.location,
        about: admin.about,
        profile_picture: admin.profile_picture,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Error in getting admin profile', error });
  }
};

// Update Admin Profile
exports.updateProfile = async (req, res) => {
  try {
    const adminId = req.adminId;
    const { name, mobile, age, location, about, profile_picture } = req.body;

    // Find admin by ID and update profile
    const admin = await Admin.findByIdAndUpdate(
      adminId,
      { name, mobile, age, location, about, profile_picture },
      { new: true }
    );

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.status(200).json({
      message: 'Admin profile updated successfully',
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        mobile: admin.mobile,
        age: admin.age,
        location: admin.location,
        about: admin.about,
        profile_picture: admin.profile_picture,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Error in updating admin profile', error });
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const { email, new_password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(new_password, 10);

    admin.password = hashedPassword;
    await admin.save();

    res.status(200).json({ message: 'Admin password reset successful' });
  } catch (error) {
    res.status(500).json({ message: 'Error in resetting password', error });
  }
};


// **Send OTP for Admin Password Reset**
exports.sendOtpForPasswordReset = async (req, res) => {
    try {
      const { email } = req.body;
  
      // Check if the admin exists
      const admin = await Admin.findOne({ email });
      if (!admin) {
        return res.status(404).json({ message: 'Admin not found' });
      }
  
      // Store OTP in the admin's document
      await sendOtp(email);
  
      // Send OTP via email
      res.status(200).json({ message: 'OTP sent successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error in sending OTP', error });
    }
  };
  
  // **Verify OTP for Password Reset**
  exports.verifyOtpForPasswordReset = async (req, res) => {
    try {
      const { email, otp } = req.body;
  
      // Find the admin by email
      const admin = await Admin.findOne({ email });
      if (!admin) {
        return res.status(404).json({ message: 'Admin not found' });
      }
  
      // Check if OTP is valid
      if (!admin.otpDetails?.otp || admin.otpDetails?.otpExpiry < Date.now()) {
        return res.status(400).json({ message: 'Invalid or expired OTP' });
      }
  
      if (admin.otpDetails.otp !== parseInt(otp)) {
        return res.status(400).json({ message: 'Incorrect OTP' });
      }
  
      // OTP verified, clear OTP fields
      admin.otpDetails.otp = null;
      admin.otpDetails.otpExpiry = null;
      await admin.save();
  
      res.status(200).json({ message: 'OTP verified successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error in verifying OTP', error });
    }
  };
  
  // **Reset Admin Password**
  exports.updatePassword = async (req, res) => {
    try {
      const { email, newPassword } = req.body;
  
      // Find admin by email
      const admin = await Admin.findOne({ email });
      if (!admin) {
        return res.status(404).json({ message: 'Admin not found' });
      }
  
      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
  
      // Update password
      admin.password = hashedPassword;
      await admin.save();
  
      res.status(200).json({ message: 'Admin password reset successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error in resetting password', error });
    }
  };