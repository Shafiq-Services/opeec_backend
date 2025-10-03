# Updated OPEEC API Collection - Postman Structure

## 📋 **SUMMARY OF CHANGES**

### **User Model Updates:**
- ✅ New users are verified by default (`isUserVerified: true`)
- ✅ Added required fields: `age`, `gender`, `DOB`, `about`, `address`
- ✅ Removed `id_card_selfie` requirement from signup
- ✅ Made `profile_image` required in signup
- ✅ Gender options limited to: `male`, `female`
- ✅ Location schema sets `lat: 0.0`, `lng: 0.0` by default

---

## 🔐 **1. USER AUTHENTICATION APIS**

### **1.1 User Signup** 
**POST** `/user/signup`

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john.doe@example.com", 
  "password": "securePassword123",
  "profile_image": "https://example.com/profile.jpg",
  "age": 25,
  "gender": "male",
  "DOB": "1999-01-15",
  "address": "123 Main Street, City, Country",
  "about": "I am a tech enthusiast who loves renting equipment for projects."
}
```

**Response:**
```json
{
  "message": "User created successfully"
}
```

**Validation Rules:**
- All fields are required
- `age`: Number between 0-150
- `gender`: Must be "male" or "female"
- `DOB`: Valid date format
- `profile_image`: Required (URL string)
- `about`: Required description text

---

### **1.2 User Login**
**POST** `/user/login`

**Request Body:**
```json
{
  "email": "john.doe@example.com",
  "password": "securePassword123",
  "fcm_token": "firebase_fcm_token_here"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "jwt_token_here",
  "_id": "user_id_here",
  "isUserVerified": true,
  "rejectionReason": "",
  "isBlocked": false,
  "blockedReason": ""
}
```

---

## 👤 **2. USER PROFILE APIS**

### **2.1 Get User Profile**
**GET** `/user/profile`

**Headers:**
```
Authorization: Bearer {{auth_token}}
```

**Response:**
```json
{
  "message": "User profile fetched successfully",
  "user": {
    "name": "John Doe",
    "email": "john.doe@example.com",
    "profile_image": "https://example.com/profile.jpg",
    "age": 25,
    "gender": "male",
    "DOB": "1999-01-15",
    "address": "123 Main Street, City, Country",
    "isUserVerified": true,
    "is_blocked": false,
    "block_reason": "",
    "fcm_token": "firebase_fcm_token_here"
  }
}
```

---

### **2.2 Update User Profile**
**PUT** `/user/update`

**Headers:**
```
Authorization: Bearer {{auth_token}}
```

**Request Body:**
```json
{
  "name": "John Doe Updated",
  "email": "john.updated@example.com",
  "profile_image": "https://example.com/new-profile.jpg",
  "age": 26,
  "gender": "male",
  "DOB": "1999-01-15",
  "address": "456 New Street, Updated City, Country"
}
```

**Response:**
```json
{
  "message": "User updated successfully",
  "user": {
    "name": "John Doe Updated",
    "email": "john.updated@example.com",
    "profile_image": "https://example.com/new-profile.jpg",
    "age": 26,
    "gender": "male",
    "DOB": "1999-01-15",
    "address": "456 New Street, Updated City, Country"
  }
}
```

**Validation Rules:**
- All fields are required
- Email uniqueness check (excluding current user)
- Same validation rules as signup for age, gender, DOB

---

## 🔧 **3. ADMIN USER MANAGEMENT APIS**

### **3.1 Get All Users (Admin)**
**GET** `/admin/users/all`

**Headers:**
```
Authorization: Bearer {{admin_token}}
```

**Query Parameters:**
```
?status=all  // Options: all, pending, active, blocked
```

**Response:**
```json
{
  "message": "Users fetched successfully",
  "users": [
    {
      "name": "John Doe",
      "email": "john.doe@example.com",
      "profile_image": "https://example.com/profile.jpg",
      "age": 25,
      "gender": "male",
      "DOB": "1999-01-15",
      "address": "123 Main Street, City, Country",
      "isUserVerified": true,
      "is_blocked": false,
      "block_reason": "",
      "fcm_token": "firebase_fcm_token_here"
    }
  ]
}
```

---

### **3.2 Search Users (Admin)**
**GET** `/admin/users/search`

**Headers:**
```
Authorization: Bearer {{admin_token}}
```

**Query Parameters:**
```
?query=john  // Search term for name or email
```

**Response:**
```json
{
  "message": "Users search completed",
  "users": [
    {
      "name": "John Doe",
      "email": "john.doe@example.com",
      "profile_image": "https://example.com/profile.jpg",
      "age": 25,
      "gender": "male",
      "DOB": "1999-01-15",
      "address": "123 Main Street, City, Country",
      "isUserVerified": true,
      "is_blocked": false,
      "block_reason": "",
      "fcm_token": "firebase_fcm_token_here"
    }
  ]
}
```

---

### **3.3 Block User (Admin)**
**PUT** `/admin/users/block`

**Headers:**
```
Authorization: Bearer {{admin_token}}
```

**Query Parameters:**
```
?userId=user_id_here&reason=Violation of terms
```

---

### **3.4 Unblock User (Admin)**
**PUT** `/admin/users/unblock`

**Headers:**
```
Authorization: Bearer {{admin_token}}
```

**Query Parameters:**
```
?userId=user_id_here
```

---

### **3.5 Approve User (Admin)**
**PUT** `/admin/users/approve`

**Headers:**
```
Authorization: Bearer {{admin_token}}
```

**Query Parameters:**
```
?userId=user_id_here
```

---

### **3.6 Reject User (Admin)**
**PUT** `/admin/users/reject`

**Headers:**
```
Authorization: Bearer {{admin_token}}
```

**Query Parameters:**
```
?userId=user_id_here&reason=Invalid documents
```

---

## 📝 **4. UNCHANGED APIS**

The following APIs remain unchanged and work as before:

### **User Authentication:**
- `POST /user/send_otp` - Send OTP for email verification
- `POST /user/verify_user_otp` - Verify user OTP
- `POST /user/forgot_or_reset_password_otp` - Send OTP for password reset
- `POST /user/reset_password` - Reset password with OTP

### **User Utilities:**
- `GET /user/app-settings` - Get public app settings
- `PUT /user/resend_id_card_selfie` - Resend ID card selfie (if still needed)
- `POST /user/request_account_reactivation` - Request account reactivation
- `GET /user/get_fcm` - Get FCM token

### **Admin User Management:**
- `PUT /admin/users/update-profile` - Admin update user profile (existing functionality)

---

## 🚨 **BREAKING CHANGES SUMMARY**

### **For Mobile/Frontend Applications:**

1. **Signup Form Updates:**
   - ✅ Add new required fields: `age`, `gender`, `DOB`, `address`, `about`
   - ✅ Remove `id_card_selfie` field
   - ✅ Make `profile_image` required
   - ✅ Limit gender options to `male`/`female`

2. **Profile Display Updates:**
   - ✅ User profile now returns: `name`, `email`, `profile_image`, `age`, `gender`, `DOB`, `address`, `isUserVerified`, `is_blocked`, `block_reason`, `fcm_token`
   - ✅ Admin user list returns same fields as user profile

3. **Profile Update Form:**
   - ✅ Update form to include: `name`, `email`, `profile_image`, `age`, `gender`, `DOB`, `address`
   - ✅ All fields are now required

4. **Default Verification:**
   - ✅ New users are verified by default (`isUserVerified: true`)

---

## 🔧 **POSTMAN ENVIRONMENT VARIABLES**

```json
{
  "base_url": "http://localhost:5001",
  "auth_token": "user_jwt_token_here",
  "admin_token": "admin_jwt_token_here"
}
```

---

## ✅ **TESTING CHECKLIST**

- [ ] Test signup with all new required fields
- [ ] Verify new users are verified by default
- [ ] Test profile GET API returns correct fields
- [ ] Test profile UPDATE API with all new fields
- [ ] Test admin user list returns correct fields
- [ ] Verify email uniqueness validation in update
- [ ] Test age/gender/DOB validation
- [ ] Confirm location defaults to lat:0.0, lng:0.0

---

**Note:** All existing equipment, order, chat, and other APIs remain unchanged. Only user-related APIs have been modified as specified.
