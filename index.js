const http = require("http");
const express = require('express');
const config = require('./config/config');
const connectDB = require('./config/db');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const categoryRoutes = require('./routes/categories');
const equipmentRoutes = require('./routes/equipment');
const orderRoutes = require('./routes/order');
const uploadRoutes = require('./routes/upload');
const chatRoutes = require('./routes/chatRoutes');
const notificationRoutes = require('./routes/notification');
const stripeRoutes = require('./routes/stripeRoutes');
const { initializeSocket } = require("./utils/socketService");

const app = express();
const server = http.createServer(app);

// Initialize WebSockets
initializeSocket(server);

// Middleware
app.use(express.json());

// Connect to MongoDB
connectDB();

// Routes
app.use('/admin', adminRoutes);
app.use('/user', userRoutes);
app.use('/categories', categoryRoutes);
app.use('/equipment', equipmentRoutes);
app.use('/order', orderRoutes);
app.use("/chat", chatRoutes);
app.use('/upload', uploadRoutes);
app.use("/notification", notificationRoutes);
app.use("/stripe", stripeRoutes);

// Base route
app.get('/', (req, res) => res.send('Hello from Node API server'));

// Handle 404 errors
app.use((req, res) => res.status(404).send('Route not found'));

// Use only one listen statement
const PORT = config.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
