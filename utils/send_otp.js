
const User = require('../models/user'); // Import the User model
const Admin = require('../models/admin'); // Import the Admin model
const { sendOTPEmail } = require('./emailService'); // Import the email service

// Function to generate and send OTP
const sendOtp = async (email) => {
  // Generate a 4-digit OTP
  const otp = Math.floor(1000 + Math.random() * 9000); // 4-digit OTP
  const expiry = Date.now() + 10 * 60 * 1000; // OTP expires in 10 minutes

  try {
    // Find the user by email and update the OTP and expiry time
    const user = await User.findOneAndUpdate(
      { email },
      { 
        'otpDetails.otp': otp, 
        'otpDetails.otpExpiry': new Date(expiry),
        'otpDetails.isOtpVerified': false
      }, // Save OTP and expiry to otpDetails subdocument
      { new: true } // Return the updated user document
    );

    const admin = await Admin.findOneAndUpdate(
      { email },
      { 
        'otpDetails.otp': otp, 
        'otpDetails.otpExpiry': new Date(expiry)
      }, // Save OTP and expiry to admin otpDetails
      { new: true } // Return the updated user document
    );

    if (!user && !admin) {
      throw new Error('User or admin not found with this email');
    }

    // Send OTP email using the email service
    await sendOTPEmail(email, otp);

  } catch (error) {
    console.error('Error sending OTP:', error); // Log the error if OTP sending fails
    throw new Error('Failed to send OTP');
  }
};

module.exports = { sendOtp };
