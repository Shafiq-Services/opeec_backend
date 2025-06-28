const jwt = require('jsonwebtoken');  // Import jsonwebtoken
const Admin = require('../models/admin');  // Import Admin model

module.exports.adminMiddleware = async (req, res, next) => {
  console.log("🔹 Admin Middleware Triggered"); // Debugging: Middleware initiated

  // Extract token from the Authorization header (Bearer token)
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    console.error("❌ Token missing in request headers"); // Debugging: Missing token
    return res.status(401).json({ message: "Token missing" });
  }

  try {
    console.log("🔹 Verifying Token...");
    
    // Verify the token
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    
    console.log("✅ Token Verified:", decodedToken); // Debugging: Show decoded token

    // Attach adminId to the request object
    req.adminId = decodedToken.adminId;

    console.log("🔹 Fetching Admin from Database, Admin ID:", req.adminId);

    // Check if admin exists in the database
    const admin = await Admin.findById(req.adminId);
    
    if (!admin) {
      console.error("❌ Admin Not Found with ID:", req.adminId); // Debugging: Admin not found
      return res.status(404).json({ message: "Invalid or expired admin token" });
    }

    console.log("✅ Admin Found:", admin.email); // Debugging: Show found admin's email

    // If the admin exists, proceed to the next middleware/route handler
    next();  
  } catch (error) {
    console.error("❌ Error in Admin Middleware:", error.message); // Debugging: Show error message
    return res.status(401).json({ message: "Invalid or expired admin token", error: error.message });
  }
};
