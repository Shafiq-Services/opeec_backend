const express = require('express');
const router = express.Router();
const { userMiddleware } = require("../middleWares/user");
const categoriesController = require('../controllers/categories');


router.use(userMiddleware);

router.post('/add', categoriesController.addCategory);
router.put('/update', categoriesController.updateCategory);
router.delete('/delete', categoriesController.deleteCategory);
router.get('/get_all', categoriesController.getAllCategories);
module.exports = router;