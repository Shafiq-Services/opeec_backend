const express = require('express');
const router = express.Router();
const userController = require('../controllers/user');
const orderController = require('../controllers/orders');
const { userMiddleware } = require("../middleWares/user");
const { adminMiddleware } = require("../middleWares/adminMiddleWare");

// Create separate routers for admin and user routes
const adminRouter = express.Router();
const userRouter = express.Router();

// ---------------------- Protected User Routes ----------------------

// Apply user middleware to user routes
userRouter.use(userMiddleware);

userRouter.get('/current-rentals', orderController.getCurrentRentals);
userRouter.get('/history-rentals', orderController.getHistoryRentals);
//seller
userRouter.put('/cancel', orderController.cancelOrder);
userRouter.put('/deliver', orderController.deliverOrder);
userRouter.put('/finish', orderController.finishOrder);
//customer
userRouter.post('/add', orderController.addOrder);
userRouter.put('/collect', orderController.collectOrder);
userRouter.put('/return', orderController.returnOrder);
userRouter.put('/change-penalty', orderController.togglePenalty);
userRouter.post('/add-review', orderController.addBuyerReview);

// ---------------------- Admin Routes ----------------------

// Apply admin middleware to admin routes
adminRouter.use(adminMiddleware);

// Get rentals by status
adminRouter.get('/get_by_status', orderController.getRentalsByStatus);

// Mount the routers at different sub-paths to avoid conflicts
router.use('/admin', adminRouter);  // Admin routes at /order/admin/*
router.use('/', userRouter);        // User routes at /order/*

module.exports = router;