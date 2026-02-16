const dotenv = require('dotenv');
dotenv.config();

// In development ONLY: always use Stripe test keys (ignore .env and DB)
if (process.env.NODE_ENV === 'development') {
  const stripeDev = require('./stripeDevDefaults');
  Object.assign(process.env, stripeDev);
  console.log('🔧 [DEV] Stripe test keys forced (NODE_ENV=development)');
}

module.exports = {
  MONGO_URI: process.env.MONGO_URI,
  PORT: process.env.PORT || 5000,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRATION: process.env.JWT_EXPIRATION || '1h',
  SECRET_KEY: process.env.SECRET_KEY,
  PUBLISHABLE_KEY: process.env.PUBLISHABLE_KEY
};
