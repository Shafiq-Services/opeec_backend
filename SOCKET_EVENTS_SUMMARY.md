# 🔌 Socket Events Complete Reference

## 💬 Chat Events (Simplified & Automated)

### Frontend Emits (Client → Server) - Chat Only
```javascript
// Join/Leave Conversation (when entering/exiting chat screen)
socket.emit('joinConversation', { conversationId });
socket.emit('leaveConversation', { conversationId });

// Typing Indicators (only manual frontend task)
socket.emit('startTyping', { conversationId, receiverId });
socket.emit('stopTyping', { conversationId, receiverId });
```

### Backend Emits (Server → Client) - Chat Automatic Events
```javascript
// New message received (automatic when someone sends message)
socket.on('newMessage', (data) => {
  // { _id, conversationId, text, senderId, receiverId, createdAt, status, equipment }
});

// Message status updates (automatic based on receiver online status)
socket.on('messageSent', (data) => {
  // { messageId, conversationId, status }
});

socket.on('messageDelivered', (data) => {
  // { messageId, status }
});

socket.on('messagesRead', (data) => {
  // { conversationId, messageIds, readBy }
  // Automatic when receiver calls getMessages API
});

// Online/Offline status (automatic on socket connect/disconnect)
socket.on('userOnline', (data) => {
  // { userId } - automatic when user connects
});

socket.on('userOffline', (data) => {
  // { userId } - automatic when user disconnects
});

// Typing indicators (based on frontend emits)
socket.on('userTyping', (data) => {
  // { conversationId, userId, isTyping }
});
```

## 🔐 User Management Events (Existing Functionality)

### Frontend Emits (Client → Server)
```javascript
// Check user verification status
socket.emit('isVerified');

// Check if user is blocked
socket.emit('isBlocked');

// Get complete user data
socket.emit('getUserData');

// Send event to specific user
socket.emit('sendToUser', { userId, event, data });
```

### Backend Emits (Server → Client)
```javascript
// User verification status response
socket.on('isVerified', (data) => {
  // { _id, isVerified, rejection_reason }
});

// User block status response
socket.on('isBlocked', (data) => {
  // { _id, isBlocked, block_reason }
});

// Complete user data response
socket.on('getUserData', (data) => {
  // { _id, isUserVerified, rejection_reason, isOtpVerified, is_blocked }
});
```

## 📊 Event Store System (Existing Functionality)

### Frontend Emits (Client → Server)
```javascript
// Save/update event data
socket.emit('saveEvent', { key, eventData });

// Retrieve event data
socket.emit('getEvent', { key });

// Update existing event
socket.emit('updateEvent', { key, newEventData });
```

### Backend Emits (Server → Client)
```javascript
// Event save confirmation
socket.on('eventSaved', (data) => {
  // { success: true, key, eventData }
});

// Event data response
socket.on('eventData', (data) => {
  // { key, eventData }
});

// Event update confirmation
socket.on('eventUpdated', (data) => {
  // { key, newEventData }
});

// Event errors
socket.on('eventError', (data) => {
  // { error: "Error message" }
});
```

## 🎯 Chat System Automation (New Features)

### ✅ What Happens Automatically (No Frontend Work)
1. **Online Status**: User marked online when calling any API
2. **Offline Status**: User marked offline on socket disconnect
3. **Message Delivery**: Status updated when receiver is online
4. **Read Receipts**: Messages marked read when getMessages called
5. **Unread Count**: Included automatically in getConversations
6. **Socket Events**: All status events emitted automatically

### 🎯 What Frontend Handles (Minimal Work)
1. **Typing Indicators**: Emit startTyping/stopTyping
2. **Conversation Management**: Join/leave conversation rooms
3. **UI Updates**: Listen to socket events and update UI

## 📱 Implementation Examples

### Chat Screen Implementation
```javascript
// On enter chat screen
socket.emit('joinConversation', { conversationId });

// On typing
socket.emit('startTyping', { conversationId, receiverId });
setTimeout(() => {
  socket.emit('stopTyping', { conversationId, receiverId });
}, 3000);

// Listen for messages
socket.on('newMessage', (data) => {
  // Add message to UI
});

// Listen for typing
socket.on('userTyping', (data) => {
  // Show/hide typing indicator
});

// On exit chat screen
socket.emit('leaveConversation', { conversationId });
```

### User Status Check Implementation
```javascript
// Check if user is verified
socket.emit('isVerified');
socket.on('isVerified', (data) => {
  if (data.isVerified) {
    // User is verified
  } else {
    // Show rejection reason: data.rejection_reason
  }
});

// Check if user is blocked
socket.emit('isBlocked');
socket.on('isBlocked', (data) => {
  if (data.isBlocked) {
    // Show block reason: data.block_reason
  }
});
```

### Event Store Implementation
```javascript
// Save equipment data for conversation
socket.emit('saveEvent', { 
  key: conversationId, 
  eventData: equipmentDetails 
});

socket.on('eventSaved', (data) => {
  console.log('Equipment data saved for conversation');
});

// Retrieve equipment data
socket.emit('getEvent', { key: conversationId });
socket.on('eventData', (data) => {
  const equipmentDetails = data.eventData;
});
```

## 🚀 Complete Feature Set

### Chat Features (Simplified)
- ✅ Real-time messaging
- ✅ Automatic read receipts
- ✅ Automatic delivery status
- ✅ Typing indicators
- ✅ Online/offline status
- ✅ Unread count automation

### User Management Features (Existing)
- ✅ Verification status checking
- ✅ Block status checking
- ✅ Complete user data retrieval
- ✅ Direct user-to-user messaging

### Event Store Features (Existing)
- ✅ Save conversation context
- ✅ Retrieve conversation data
- ✅ Update conversation details
- ✅ Error handling

## 🎯 Summary

**Chat System**: 4 frontend emits, everything else automated
**User Management**: Full verification and blocking system
**Event Store**: Complete data persistence for conversations

The system now provides **complete functionality** with both **simplified chat** and **full user management** capabilities! 