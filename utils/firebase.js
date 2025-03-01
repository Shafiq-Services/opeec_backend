const admin = require('firebase-admin');
const serviceAccount = require('../config/serviceAccount');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
