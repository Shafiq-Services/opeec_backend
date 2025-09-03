const http = require("http");
const express = require('express');
const cors = require('cors');
const config = require('./config/config');
const connectDB = require('./config/db');
const adminRoutes = require('./routes/admin');
const adminUserRoutes = require('./routes/adminUserRoutes');
const adminEquipmentRoutes = require('./routes/adminEquipmentRoutes');
const adminOrderRoutes = require('./routes/adminOrderRoutes');
const adminCategoryRoutes = require('./routes/adminCategoryRoutes');
const adminDashboardRoutes = require('./routes/adminDashboardRoutes');
const adminSettingsRoutes = require('./routes/adminSettingsRoutes');
const adminSupportChatRoutes = require('./routes/adminSupportChatRoutes');
const adminNotificationRoutes = require('./routes/adminNotificationRoutes');
const userRoutes = require('./routes/user');
const categoryRoutes = require('./routes/categories');
const equipmentRoutes = require('./routes/equipment');
const orderRoutes = require('./routes/order');
const uploadRoutes = require('./routes/upload');
const chatRoutes = require('./routes/chatRoutes');
const notificationRoutes = require('./routes/notification');
const stripeRoutes = require('./routes/stripeRoutes');
const percentageSettings = require('./routes/percentageSettings');
const walletRoutes = require('./routes/wallet.routes');
const withdrawalRoutes = require('./routes/withdrawal.routes');
const adminWithdrawalRoutes = require('./routes/admin.withdrawal.routes');
const { initializeSocket, sendEventToUser, connectedUsers } = require("./utils/socketService");
const { createAdminNotification } = require('./controllers/adminNotificationController');

const app = express();
const server = http.createServer(app);

// Initialize WebSockets
initializeSocket(server);

// CORS Configuration
const corsOptions = {
  origin: true, // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  credentials: true,
  optionsSuccessStatus: 200 // For legacy browser support
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests for all routes
app.options('*', cors(corsOptions));

// Middleware
app.use(express.json());

// Connect to MongoDB
connectDB();

// Routes
app.use('/admin', adminRoutes);
app.use('/admin/users', adminUserRoutes);
app.use('/admin/equipment', adminEquipmentRoutes);
app.use('/admin/orders', adminOrderRoutes);
app.use('/admin/categories', adminCategoryRoutes);
app.use('/admin/dashboard', adminDashboardRoutes);
app.use('/admin/settings', adminSettingsRoutes);
app.use('/admin/support', adminSupportChatRoutes);
app.use('/admin/notifications', adminNotificationRoutes);
app.use('/user', userRoutes);
app.use('/categories', categoryRoutes);
app.use('/equipment', equipmentRoutes);
app.use('/order', orderRoutes);
app.use("/chat", chatRoutes);
app.use('/upload', uploadRoutes);
app.use("/notification", notificationRoutes);
app.use("/stripe", stripeRoutes);
app.use('/perrcentageSettings', percentageSettings);
app.use('/wallet', walletRoutes);
app.use('/withdrawals', withdrawalRoutes);
app.use('/admin/withdrawals', adminWithdrawalRoutes);

// Base route
app.get('/', (req, res) => res.send('Hello from Node API server'));

// Handle 404 errors
app.use((req, res) => res.status(404).send('Route not found'));

// Use only one listen statement
const PORT = config.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
