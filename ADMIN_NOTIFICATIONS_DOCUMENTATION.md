# Admin Notifications System - Frontend Integration Guide

## Socket Events

### 1. Admin Notification Event
**Event Name:** `adminNotification`

**Structure:**
```json
{
  "_id": "64a1b2c3d4e5f6789012345a",
  "title": "New User Registration",
  "body": "New user John Doe registered with email john@example.com",
  "type": "user_registration",
  "color": "#3B82F6",
  "icon": "user-plus",
  "relatedUserId": "64a1b2c3d4e5f6789012345b",
  "relatedEquipmentId": null,
  "relatedOrderId": null,
  "data": {
    "userName": "John Doe",
    "userEmail": "john@example.com",
    "registrationDate": "2024-01-15T10:30:00.000Z"
  },
  "createdAt": "2024-01-15T10:30:00.000Z",
  "unreadCount": 5
}
```

### 2. Admin Notification Unread Count Event
**Event Name:** `adminNotificationUnreadCount`

**Structure:**
```json
{
  "unreadCount": 3
}
```

## Notification Types

| Type | Color | Icon | Description |
|------|-------|------|-------------|
| `user_registration` | `#3B82F6` (Blue) | `user-plus` | New user registration |
| `user_verification_request` | `#F59E0B` (Orange) | `user-check` | User submitted ID for verification |
| `user_appeal_request` | `#EF4444` (Red) | `user-x` | Blocked user requesting reactivation |
| `equipment_submission` | `#10B981` (Green) | `package-plus` | New equipment submitted for approval |
| `equipment_resubmission` | `#8B5CF6` (Purple) | `package-check` | Equipment resubmitted after rejection |
| `rental_booking` | `#059669` (Emerald) | `calendar-check` | New rental booking created |
| `late_return_alert` | `#DC2626` (Dark Red) | `clock-alert` | Order overdue by 24+ hours |
| `penalty_dispute` | `#F97316` (Orange) | `alert-triangle` | User disputed penalty charges |

## Admin Socket Events - Complete Reference

### 🔔 **Admin Notification Events**

**1. `adminNotification` (Primary Event)**
- **Type:** Listen
- **Triggered:** When any new admin notification is created
- **Purpose:** Real-time notification delivery to admin
- **Body Structure:** *(Same as above Socket Events section)*

**2. `adminNotificationUnreadCount` (Count Updates)**
- **Type:** Listen  
- **Triggered:** When admin connects OR when new notification is added
- **Purpose:** Keep unread badge count synchronized
- **Body Structure:** *(Same as above Socket Events section)*

### 💬 **Admin Chat Events (Support)**

**3. `newSupportMessage` (Support Tickets)**
- **Type:** Listen (Admin Only)
- **Triggered:** When users send support messages to admin
- **Body:**
```json
{
  "_id": "message_id",
  "conversationId": "conversation_id",
  "text": "User's support message",
  "senderId": "user_id", 
  "receiverId": "admin_id",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "status": "sent|delivered|read",
  "isNewSupportMessage": true,
  "sender": {
    "_id": "user_id",
    "name": "User Name", 
    "email": "user@example.com",
    "picture": "profile_image_url",
    "userType": "user"
  },
  "receiver": {
    "_id": "admin_id",
    "name": "Admin Name",
    "email": "admin@example.com", 
    "picture": "admin_profile_image",
    "userType": "admin"
  }
}
```

**4. `newMessage` (General Messages)**
- **Type:** Listen
- **Triggered:** When admin receives any chat message (including replies)
- **Usage:** Handle general chat communication

**5. `messageDelivered` (Delivery Confirmation)**  
- **Type:** Listen
- **Triggered:** When admin's reply is delivered to user
- **Usage:** Update message status to "delivered"

**6. `messageSent` (Send Confirmation)**
- **Type:** Listen
- **Triggered:** Confirmation that admin's message was sent
- **Usage:** Update UI to show message sent successfully

**7. `messagesRead` (Read Receipts)**
- **Type:** Listen  
- **Triggered:** When users read admin's messages
- **Usage:** Show blue checkmarks, update message status

### ⌨️ **Typing Indicators (Admin Chat)**

**8. `userTyping` (Typing Status)**
- **Type:** Listen
- **Triggered:** When users start/stop typing to admin
- **Body:**
```json
{
  "conversationId": "conversation_id",
  "userId": "user_id",
  "isTyping": true, // false when stopped
  "typingUser": {
    "_id": "user_id",
    "name": "User Name",
    "userType": "user"
  },
  "receiver": {
    "_id": "admin_id", 
    "name": "Admin Name",
    "userType": "admin"
  }
}
```

### 🌐 **Connection & Presence Events**

**9. `userOnline` (User Status)**
- **Type:** Listen
- **Triggered:** When any user comes online
- **Usage:** Show green indicators next to users

**10. `userOffline` (User Status)**  
- **Type:** Listen
- **Triggered:** When any user goes offline
- **Usage:** Update user status indicators

### 📤 **Admin Emitted Events (Send These)**

**11. `joinConversation` (Enter Chat)**
- **Type:** Emit
- **When:** Admin opens a support conversation
- **Body:** `{"conversationId": "conversation_id"}`

**12. `leaveConversation` (Exit Chat)**
- **Type:** Emit  
- **When:** Admin closes a support conversation
- **Body:** `{"conversationId": "conversation_id"}`

**13. `startTyping` (Typing Indicator)**
- **Type:** Emit
- **When:** Admin starts typing reply
- **Body:** `{"conversationId": "conversation_id", "receiverId": "user_id"}`

**14. `stopTyping` (Stop Typing)**
- **Type:** Emit
- **When:** Admin stops typing or sends message
- **Body:** `{"conversationId": "conversation_id", "receiverId": "user_id"}`

## REST API Endpoint

### Get Admin Notifications List
**Endpoint:** `GET /admin/notifications/list`

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Query Parameters:**
- `page` (optional, default: 1) - Page number  
- `limit` (optional, default: 20) - Items per page

**Response:**
```json
{
  "message": "Admin notifications retrieved successfully",
  "status": true,
  "notifications": [
    {
      "_id": "64a1b2c3d4e5f6789012345a",
      "title": "New User Registration",
      "body": "New user John Doe registered with email john@example.com",
      "type": "user_registration",
      "color": "#3B82F6",
      "icon": "user-plus",
      "relatedUser": {
        "_id": "64a1b2c3d4e5f6789012345b",
        "name": "John Doe",
        "email": "john@example.com", 
        "profile_image": ""
      },
      "relatedEquipment": null,
      "relatedOrder": null,
      "data": {
        "userName": "John Doe",
        "userEmail": "john@example.com",
        "registrationDate": "2024-01-15T10:30:00.000Z"
      },
      "isRead": true,
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalNotifications": 45,
    "unreadCount": 0
  }
}
```

**⚠️ Important:** This API automatically marks ALL notifications as read when called.

## Socket Implementation in Flutter

### 1. Connect to Socket with Admin Token
```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

// Connect to socket
IO.Socket socket = IO.io('your_server_url', 
  IO.OptionBuilder()
    .setTransports(['websocket'])
    .setAuth({'token': admin_token})
    .build()
);

socket.connect();
```

### 2. Listen for Admin Notifications
```dart
// Listen for new admin notifications
socket.on('adminNotification', (data) {
  print('New admin notification: $data');
  
  // Update local notification list
  _addNotificationToList(AdminNotification.fromJson(data));
  
  // Show local notification/badge
  _showLocalNotification(data);
  
  // Update unread count
  _updateUnreadCount(data['unreadCount']);
});

// Listen for unread count updates
socket.on('adminNotificationUnreadCount', (data) {
  print('Unread count update: ${data['unreadCount']}');
  _updateUnreadCount(data['unreadCount']);
});
```

### 3. Admin Notification Model (Flutter)
```dart
class AdminNotification {
  final String id;
  final String title;
  final String body;
  final String type;
  final String color;
  final String icon;
  final String? relatedUserId;
  final String? relatedEquipmentId;
  final String? relatedOrderId;
  final Map<String, dynamic> data;
  final bool isRead;
  final DateTime createdAt;

  AdminNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    required this.color,
    required this.icon,
    this.relatedUserId,
    this.relatedEquipmentId,
    this.relatedOrderId,
    required this.data,
    required this.isRead,
    required this.createdAt,
  });

  factory AdminNotification.fromJson(Map<String, dynamic> json) {
    return AdminNotification(
      id: json['_id'],
      title: json['title'],
      body: json['body'],
      type: json['type'],
      color: json['color'],
      icon: json['icon'],
      relatedUserId: json['relatedUserId'],
      relatedEquipmentId: json['relatedEquipmentId'],
      relatedOrderId: json['relatedOrderId'],
      data: json['data'] ?? {},
      isRead: json['isRead'] ?? false,
      createdAt: DateTime.parse(json['createdAt']),
    );
  }
}
```

## Important Notes

1. **Socket-First Approach**: Admin notifications are primarily delivered via socket events. The REST API is only for loading historical notifications list.

2. **Auto Read Marking**: When admin calls the `/admin/notifications/list` endpoint, ALL notifications are automatically marked as read and unread count is reset to 0.

3. **Real-time Unread Count**: The `adminNotificationUnreadCount` event is sent in two situations:
   - When admin connects to socket (initial unread count)
   - When a new notification is created (updated unread count)

4. **Support Message Priority**: `newSupportMessage` events should be handled with higher priority as they represent user support requests.

5. **Connection Management**: Admin must emit `joinConversation`/`leaveConversation` events to properly receive chat messages and typing indicators.

6. **Related Data Navigation**: Each notification includes related user, equipment, or order IDs for navigation purposes.

7. **Consistent Styling**: Use the provided color (hex code) and icon identifier to style notifications consistently across the admin interface.

8. **Typing Indicators**: Admin should emit `startTyping`/`stopTyping` events for better user experience in support chats.

## Testing

You can test the notifications by:
1. Registering a new user → Triggers `user_registration`
2. Submitting ID documents → Triggers `user_verification_request`
3. Requesting account reactivation (blocked user) → Triggers `user_appeal_request`
4. Adding new equipment → Triggers `equipment_submission`
5. Editing rejected equipment → Triggers `equipment_resubmission`
6. Creating a new rental order → Triggers `rental_booking`
7. Waiting for order to become late → Triggers `late_return_alert` (automated)
8. Disputing a penalty → Triggers `penalty_dispute`
9. Sending support messages (user to admin) → Triggers `newSupportMessage`
