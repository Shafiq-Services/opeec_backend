const jwt = require('jsonwebtoken');  
const User = require('../models/User');  
const Admin = require('../models/admin');  

module.exports.commonMiddleware = async (req, res, next) => {
  // Extract token from the Authorization header (Bearer token)
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token missing" });  // If no token is provided, return error
  }

  try {
    // Verify the token
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if it's a User or Admin
    const user = await User.findById(decodedToken.userId);
    const admin = await Admin.findById(decodedToken.adminId);

    if (!user && !admin) {
      return res.status(404).json({ message: "Invalid or expired token" });  // Neither user nor admin found
    }

    // Attach ID to request (userId for users, adminId for admins)
    req.userId = user ? user._id : null;
    req.adminId = admin ? admin._id : null;

    // Proceed to the next middleware/route handler
    next();  
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token", error: error.message });  // If token is invalid or expired
  }
};
