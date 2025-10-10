# 📱 FRONTEND DEVELOPER GUIDE - Stripe Identity Verification

## 🎯 QUICK START

This guide is for **Mobile App** and **Admin Panel** developers implementing Stripe Identity verification.

---

## 📱 MOBILE APP IMPLEMENTATION

### ✅ What You Need to Do:

1. **Handle verification status in login/profile**
2. **Show verification requirement when renting**
3. **Initiate verification flow**
4. **Handle verification completion**

### 🚀 Step-by-Step Implementation:

---

### **STEP 1: Get Verification Info on App Load**

```javascript
// On app startup or login
const loginResponse = await POST('/user/login', {
  email,
  password,
  fcm_token
});

// Response now includes:
const verificationStatus = loginResponse.stripe_verification.status;
// Possible values: 'not_verified', 'pending', 'verified', 'failed'

// Store this in your app state
setUser({
  ...loginResponse,
  isVerified: verificationStatus === 'verified'
});
```

---

### **STEP 2: Show Verification Banner (Optional)**

```javascript
// In your home screen or profile
{user.stripe_verification.status !== 'verified' && (
  <VerificationBanner
    status={user.stripe_verification.status}
    onPress={() => navigateToVerification()}
  />
)}
```

**Banner Component Example:**
```jsx
function VerificationBanner({ status, onPress }) {
  const getMessage = () => {
    switch(status) {
      case 'not_verified':
        return 'Verify your identity to start renting equipment';
      case 'pending':
        return 'Your verification is in progress';
      case 'failed':
        return 'Verification failed. Please try again';
      default:
        return '';
    }
  };

  return (
    <TouchableOpacity onPress={onPress} style={styles.banner}>
      <Icon name="shield-check" />
      <Text>{getMessage()}</Text>
      <Icon name="arrow-right" />
    </TouchableOpacity>
  );
}
```

---

### **STEP 3: Handle Rental Attempt**

```javascript
// When user tries to rent equipment
async function handleRentEquipment(orderData) {
  try {
    const response = await POST('/order/add', orderData);
    
    // Success - navigate to success screen
    navigation.navigate('OrderSuccess', { orderId: response.data._id });
    
  } catch (error) {
    // Check if verification is required
    if (error.error_code === 'verification_required') {
      // Show verification required dialog
      showVerificationRequiredDialog({
        status: error.verification_status,
        message: error.message
      });
    } else {
      // Handle other errors
      showError(error.message);
    }
  }
}
```

**Verification Required Dialog:**
```jsx
function VerificationRequiredDialog({ visible, onClose, onVerify }) {
  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        <Icon name="shield-check" size={60} color="#4CAF50" />
        
        <Text style={styles.title}>
          Identity Verification Required
        </Text>
        
        <Text style={styles.description}>
          To ensure a safe rental experience, we need to verify your identity.
          This is a one-time process.
        </Text>
        
        <View style={styles.feeInfo}>
          <Text style={styles.feeLabel}>Verification Fee:</Text>
          <Text style={styles.feeAmount}>$2.00</Text>
        </View>
        
        <Button title="Verify Now" onPress={onVerify} />
        <Button title="Later" onPress={onClose} variant="text" />
      </View>
    </Modal>
  );
}
```

---

### **STEP 4: Initiate Verification**

```javascript
async function startVerification() {
  try {
    // Show loading
    setLoading(true);
    
    // Get payment method from user
    const paymentMethod = await showPaymentMethodSelector();
    // paymentMethod.id should be like 'pm_1234567890'
    
    // Call backend to initiate verification
    const response = await POST('/user/verification/initiate', {
      return_url: 'myapp://verification-complete',
      payment_method_id: paymentMethod.id
    });
    
    // Backend has charged $2 and created session
    // Now open Stripe Identity in browser/WebView
    const { session_url, verification_info } = response;
    
    // Open in browser (iOS/Android)
    await Linking.openURL(session_url);
    
    // OR use WebView for in-app experience
    navigation.navigate('StripeIdentityWebView', { url: session_url });
    
  } catch (error) {
    if (error.error_code === 'payment_failed') {
      showError('Payment failed. Please check your payment method.');
    } else {
      showError(error.message);
    }
  } finally {
    setLoading(false);
  }
}
```

**Payment Method Selector (Simplified):**
```javascript
// You can use Stripe SDK for this
import { CardField, useStripe } from '@stripe/stripe-react-native';

function PaymentMethodSelector() {
  const { createPaymentMethod } = useStripe();
  
  async function handleConfirm() {
    const result = await createPaymentMethod({
      type: 'Card',
    });
    
    return result.paymentMethod; // Contains .id
  }
  
  return (
    <View>
      <CardField style={styles.cardField} />
      <Button title="Confirm" onPress={handleConfirm} />
    </View>
  );
}
```

---

### **STEP 5: Handle Verification Completion**

**Option A: Deep Link Handling**
```javascript
// In your App.js or navigation setup
useEffect(() => {
  const handleDeepLink = async ({ url }) => {
    if (url.includes('verification-complete')) {
      // Webhook already updated status, just refresh
      await refreshUserProfile();
      
      // Check new status
      const profile = await GET('/user/profile');
      
      if (profile.user.stripe_verification.status === 'verified') {
        showSuccess('Verification complete! You can now rent equipment.');
      } else {
        showError('Verification failed. Please try again.');
      }
    }
  };
  
  Linking.addEventListener('url', handleDeepLink);
  
  return () => {
    Linking.removeEventListener('url', handleDeepLink);
  };
}, []);
```

**Option B: Poll Status (Not Recommended)**
```javascript
// Only if deep links don't work
async function checkVerificationStatus() {
  const response = await GET('/user/verification/status');
  return response.verification_status;
}

// Poll every 5 seconds
const interval = setInterval(async () => {
  const status = await checkVerificationStatus();
  if (status === 'verified' || status === 'failed') {
    clearInterval(interval);
    handleVerificationComplete(status);
  }
}, 5000);
```

---

### **STEP 6: Socket Notification (Recommended)**

```javascript
// Listen for real-time verification updates
socket.on('verificationStatusChanged', (data) => {
  console.log('Verification status:', data.status);
  console.log('Message:', data.message);
  
  // Update UI immediately
  setUser(prev => ({
    ...prev,
    stripe_verification: {
      ...prev.stripe_verification,
      status: data.status
    }
  }));
  
  // Show notification
  if (data.status === 'verified') {
    showSuccess(data.message);
  } else if (data.status === 'failed') {
    showError(data.message);
  }
});
```

---

### **STEP 7: Profile Screen**

```jsx
function ProfileScreen() {
  const { user } = useAuth();
  const verification = user.stripe_verification;
  
  return (
    <View>
      <Text style={styles.sectionTitle}>Verification Status</Text>
      
      <View style={styles.verificationCard}>
        {verification.status === 'verified' ? (
          <>
            <Icon name="check-circle" size={40} color="#4CAF50" />
            <Text style={styles.verified}>Verified</Text>
            <Text style={styles.date}>
              Since {formatDate(verification.verified_at)}
            </Text>
          </>
        ) : (
          <>
            <Icon name="alert-circle" size={40} color="#FF9800" />
            <Text style={styles.notVerified}>Not Verified</Text>
            <Button 
              title="Verify Now" 
              onPress={() => startVerification()} 
            />
          </>
        )}
      </View>
    </View>
  );
}
```

---

## 🎨 ADMIN PANEL IMPLEMENTATION

### ✅ What You Need to Do:

1. **Show verification status in user list**
2. **Filter users by verification status**
3. **View verification history**

---

### **STEP 1: User List with Verification Status**

```jsx
// UserListTable.jsx
function UserListTable() {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('all');
  
  useEffect(() => {
    loadUsers();
  }, [filter]);
  
  async function loadUsers() {
    const response = await GET(`/admin/users/all?status=${filter}`);
    setUsers(response.users);
  }
  
  return (
    <div>
      <FilterBar>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All Users</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="blocked">Blocked</option>
        </Select>
      </FilterBar>
      
      <Table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Status</th>
            <th>Verification</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user._id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>
                <Badge color={user.is_blocked ? 'red' : 'green'}>
                  {user.is_blocked ? 'Blocked' : 'Active'}
                </Badge>
              </td>
              <td>
                <VerificationBadge 
                  status={user.stripe_verification.status} 
                />
              </td>
              <td>
                <Button onClick={() => viewUser(user._id)}>View</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function VerificationBadge({ status }) {
  const config = {
    verified: { color: 'green', icon: '✓', label: 'Verified' },
    pending: { color: 'blue', icon: '⏳', label: 'Pending' },
    not_verified: { color: 'gray', icon: '○', label: 'Not Verified' },
    failed: { color: 'red', icon: '✗', label: 'Failed' }
  };
  
  const { color, icon, label } = config[status] || config.not_verified;
  
  return (
    <Badge color={color}>
      {icon} {label}
    </Badge>
  );
}
```

---

### **STEP 2: Filter by Verification Status**

```jsx
function VerificationFilterPage() {
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState('pending');
  
  useEffect(() => {
    loadUsersByVerification();
  }, [status]);
  
  async function loadUsersByVerification() {
    const response = await GET(
      `/admin/users/verification-filter?status=${status}`
    );
    setUsers(response.users);
  }
  
  return (
    <div>
      <h2>Verification Management</h2>
      
      <TabBar>
        <Tab 
          active={status === 'not_verified'} 
          onClick={() => setStatus('not_verified')}
        >
          Not Verified ({users.filter(u => u.stripe_verification.status === 'not_verified').length})
        </Tab>
        <Tab 
          active={status === 'pending'} 
          onClick={() => setStatus('pending')}
        >
          Pending ({users.filter(u => u.stripe_verification.status === 'pending').length})
        </Tab>
        <Tab 
          active={status === 'verified'} 
          onClick={() => setStatus('verified')}
        >
          Verified ({users.filter(u => u.stripe_verification.status === 'verified').length})
        </Tab>
        <Tab 
          active={status === 'failed'} 
          onClick={() => setStatus('failed')}
        >
          Failed ({users.filter(u => u.stripe_verification.status === 'failed').length})
        </Tab>
      </TabBar>
      
      <UserTable users={users} />
    </div>
  );
}
```

---

### **STEP 3: View Verification History**

```jsx
function UserDetailPage({ userId }) {
  const [history, setHistory] = useState(null);
  
  useEffect(() => {
    loadVerificationHistory();
  }, [userId]);
  
  async function loadVerificationHistory() {
    const response = await GET(
      `/admin/users/${userId}/verification-history`
    );
    setHistory(response);
  }
  
  if (!history) return <Loading />;
  
  return (
    <div>
      <Card>
        <h3>Verification Status</h3>
        <StatusBadge status={history.current_status} />
        
        {history.verified_at && (
          <p>Verified on: {formatDate(history.verified_at)}</p>
        )}
        
        <Divider />
        
        <h4>Statistics</h4>
        <Stats>
          <Stat label="Total Attempts" value={history.total_attempts} />
          <Stat label="Successful" value={history.successful_attempts} />
          <Stat label="Fee Paid" value={history.fee_paid ? 'Yes' : 'No'} />
        </Stats>
      </Card>
      
      <Card>
        <h3>Verification History</h3>
        <Timeline>
          {history.verification_history.map((attempt, index) => (
            <TimelineItem key={index}>
              <TimelineDot color={getStatusColor(attempt.status)} />
              <TimelineContent>
                <p><strong>{attempt.status}</strong></p>
                <p>Started: {formatDate(attempt.created_at)}</p>
                {attempt.completed_at && (
                  <p>Completed: {formatDate(attempt.completed_at)}</p>
                )}
                {attempt.failure_reason && (
                  <p className="error">Reason: {attempt.failure_reason}</p>
                )}
                <p className="session-id">Session: {attempt.session_id}</p>
              </TimelineContent>
            </TimelineItem>
          ))}
        </Timeline>
      </Card>
    </div>
  );
}
```

---

## 🎨 UI/UX BEST PRACTICES

### Mobile App:

1. **Verification Banner:**
   - Show prominently on home screen
   - Use clear call-to-action
   - Dismiss after verification

2. **Verification Dialog:**
   - Explain why verification is needed
   - Show fee upfront
   - Provide "Later" option

3. **Loading States:**
   - Show progress during payment
   - Show loading while creating session
   - Show status while in verification

4. **Success/Error:**
   - Clear success message with checkmark
   - Error message with retry option
   - Link to support if repeated failures

### Admin Panel:

1. **Dashboard Stats:**
   - Show verification completion rate
   - Highlight pending verifications
   - Track failed verifications

2. **User List:**
   - Color-coded badges
   - Filter options
   - Quick actions

3. **Detail View:**
   - Timeline of attempts
   - Link to Stripe dashboard
   - Contact user option

---

## 🧪 TESTING CHECKLIST

### Mobile App:
- [ ] Login shows verification status
- [ ] Banner appears for unverified users
- [ ] Rental blocks unverified users
- [ ] Verification dialog displays correctly
- [ ] Payment method collection works
- [ ] Stripe session opens correctly
- [ ] Deep link handling works
- [ ] Socket notifications work
- [ ] Profile shows correct status
- [ ] Success/error messages display

### Admin Panel:
- [ ] User list shows verification status
- [ ] Filter by status works
- [ ] Verification history displays
- [ ] Timeline shows all attempts
- [ ] Stats calculate correctly

---

## 📞 SUPPORT & TROUBLESHOOTING

### Common Issues:

**Issue: Payment fails**
- Check payment method is valid
- Ensure Stripe keys are correct
- Check network connectivity

**Issue: Deep link doesn't work**
- Verify URL scheme in app config
- Check return_url format
- Use socket notifications as fallback

**Issue: Status doesn't update**
- Check webhook is configured
- Verify webhook secret in .env
- Check server logs

---

## 📚 RESOURCES

- Stripe Identity Docs: https://stripe.com/docs/identity
- Stripe React Native SDK: https://github.com/stripe/stripe-react-native
- Deep Linking Guide: https://reactnative.dev/docs/linking

---

**Need Help?** Contact backend team or check `STRIPE_IDENTITY_VERIFICATION.md` for full documentation.




