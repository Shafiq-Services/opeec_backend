const express = require('express');
const { getStripeKeys } = require('../controllers/stripe');
const router = express.Router();
const { userMiddleware } = require("../middleWares/user");

router.use(userMiddleware)
router.get('/keys', getStripeKeys);

module.exports = router;
