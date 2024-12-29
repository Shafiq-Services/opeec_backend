const jwt = require('jsonwebtoken');  // Import jsonwebtoken
const User = require('../models/User');  // Import User model to check user existence

module.exports.userMiddleware = async (req, res, next) => {
  // Extract token from the Authorization header (Bearer token)
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token missing" });  // If no token is provided, return error
  }

  try {
    // Verify the token
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach userId to the request object
    req.userId = decodedToken.userId;
    // Check if user exists in the database
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ message: "Invalid or expired token" });  // User not found
    }

    // If the user exists, proceed to the next middleware/route handler
    next();  
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token", error: error.message });  // If token is invalid or expired
  }
};
