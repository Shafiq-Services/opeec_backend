const router = require('express').Router();
const { commonMiddleware } = require('../middleWares/common');

// Controllers
const {
  getPercentageSettings,
  updatePercentageSettings
} = require('../controllers/percentageSettings');


router.use(commonMiddleware);
// Routes
router.get('/getPercentageSettings', getPercentageSettings);       // GET /api/percentage-settings
router.put('/updatePercentageSettings', updatePercentageSettings);    // PUT /api/percentage-settings

module.exports = router;
