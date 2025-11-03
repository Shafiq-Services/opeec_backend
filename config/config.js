const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  MONGO_URI: process.env.MONGO_URI,
  PORT: process.env.PORT || 5000,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRATION: process.env.JWT_EXPIRATION || '1h',
  SECRET_KEY: process.env.SECRET_KEY,
  PUBLISHABLE_KEY: process.env.PUBLISHABLE_KEY
};
