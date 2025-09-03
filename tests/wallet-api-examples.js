/**
 * Wallet & Withdrawal API Examples and Basic Tests
 * 
 * This file contains example requests and basic validation tests for the new wallet endpoints.
 * These can be imported into Postman or used as reference for frontend integration.
 */

// ========================================================================================
// SELLER WALLET ENDPOINTS
// ========================================================================================

/**
 * GET /wallet - Get wallet information
 * 
 * Headers:
 * Authorization: Bearer {user_jwt_token}
 * 
 * Query Parameters:
 * - page (optional): Page number for history pagination (default: 1)
 * - limit (optional): Items per page (default: 20)
 * - type (optional): Filter history by type (ORDER_EARNING, PENALTY, etc.)
 */
const walletInfoExample = {
  method: 'GET',
  url: '/wallet?page=1&limit=10',
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    'Content-Type': 'application/json'
  },
  expectedResponse: {
    "balance": 175.50,
    "history": [
      {
        "type": "Deposit",
        "amount": 44.00,
        "date": "2024-01-15T10:30:00.000Z",
        "time": "10:30 AM"
      },
      {
        "type": "Withdraw Request",
        "amount": -50.00,
        "date": "2024-01-14T14:20:00.000Z", 
        "time": "02:20 PM"
      },
      {
        "type": "Payment",
        "amount": -25.00,
        "date": "2024-01-13T09:15:00.000Z",
        "time": "09:15 AM"
      }
    ]
  }
};

/**
 * POST /withdrawals - Create withdrawal request
 * 
 * Headers:
 * Authorization: Bearer {user_jwt_token}
 * 
 * Body:
 * - amount: Withdrawal amount (must not exceed available balance)
 * - payment_method: Payment method object with type and details
 */
const createWithdrawalExample = {
  method: 'POST',
  url: '/withdrawals',
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    'Content-Type': 'application/json'
  },
  body: {
    "amount": 100.00,
    "payment_method": {
      "type": "bank_transfer",
      "details": {
        "account_number": "1234567890",
        "routing_number": "123456789",
        "account_holder_name": "John Doe",
        "bank_name": "Example Bank"
      }
    }
  },
  expectedResponse: {
    "success": true,
    "message": "Withdrawal request created successfully"
  }
};

/**
 * GET /withdrawals - Get seller's withdrawal requests
 * 
 * Headers:
 * Authorization: Bearer {user_jwt_token}
 * 
 * Query Parameters:
 * - page (optional): Page number (default: 1)
 * - limit (optional): Items per page (default: 20)
 * - status (optional): Filter by status (Pending, Approved, Paid, Rejected)
 */
const getWithdrawalsExample = {
  method: 'GET',
  url: '/withdrawals?status=Pending&page=1&limit=5',
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    'Content-Type': 'application/json'
  },
  expectedResponse: {
    "requests": [
      {
        "id": "64f1a2b3c4d5e6f7g8h9i0j3",
        "amount": 100.00,
        "status": "Pending",
        "date": "2024-01-15T14:20:00.000Z",
        "time": "02:20 PM",
        "payment_method": "bank_transfer",
        "rejection_reason": ""
      },
      {
        "id": "64f1a2b3c4d5e6f7g8h9i0j4",
        "amount": 75.00,
        "status": "Approved",
        "date": "2024-01-10T09:30:00.000Z",
        "time": "09:30 AM",
        "payment_method": "paypal",
        "rejection_reason": ""
      }
    ]
  }
};

// ========================================================================================
// ADMIN WITHDRAWAL ENDPOINTS
// ========================================================================================

/**
 * GET /admin/withdrawals - Get all withdrawal requests for admin review
 * 
 * Headers:
 * Authorization: Bearer {admin_jwt_token}
 * 
 * Query Parameters:
 * - page (optional): Page number (default: 1)
 * - limit (optional): Items per page (default: 20)
 * - status (optional): Filter by status (Pending, Approved, Paid, Rejected)
 */
const adminGetWithdrawalsExample = {
  method: 'GET',
  url: '/admin/withdrawals?status=Pending&page=1&limit=10',
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    'Content-Type': 'application/json'
  },
  expectedResponse: {
    "message": "Withdrawal requests retrieved successfully",
    "withdrawal_requests": [
      {
        "_id": "64f1a2b3c4d5e6f7g8h9i0j3",
        "seller": {
          "_id": "64f1a2b3c4d5e6f7g8h9i0j4",
          "name": "John Doe",
          "email": "john@example.com",
          "profile_image": "https://example.com/profile.jpg"
        },
        "amount": 100.00,
        "status": "Pending",
        "payment_method": {
          "type": "bank_transfer",
          "details": {
            "account_number": "1234567890",
            "routing_number": "123456789",
            "account_holder_name": "John Doe",
            "bank_name": "Example Bank"
          }
        },
        "rejection_reason": "",
        "reviewed_by": null,
        "external_reference": {},
        "createdAt": "2024-01-15T14:20:00.000Z"
      }
    ]
  }
};

/**
 * POST /admin/withdrawals/:id/mark-paid - Mark withdrawal as paid
 * 
 * Headers:
 * Authorization: Bearer {admin_jwt_token}
 * 
 * Body:
 * - external_reference (optional): Payment reference information
 */
const adminMarkPaidExample = {
  method: 'POST',
  url: '/admin/withdrawals/64f1a2b3c4d5e6f7g8h9i0j3/mark-paid',
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    'Content-Type': 'application/json'
  },
  body: {
    "external_reference": {
      "transaction_id": "TXN_12345678",
      "receipt_url": "https://bank.example.com/receipts/12345",
      "screenshot_url": "https://uploads.example.com/payment_screenshot.jpg",
      "notes": "Payment processed via wire transfer"
    }
  },
  expectedResponse: {
    "message": "Withdrawal request marked as paid successfully",
    "withdrawal_request": {
      "_id": "64f1a2b3c4d5e6f7g8h9i0j3",
      "status": "Paid",
      "amount": 100.00,
      "external_reference": {
        "transaction_id": "TXN_12345678",
        "receipt_url": "https://bank.example.com/receipts/12345",
        "screenshot_url": "https://uploads.example.com/payment_screenshot.jpg",
        "notes": "Payment processed via wire transfer"
      },
      "paid_at": "2024-01-15T16:30:00.000Z",
      "payout_transaction_id": "64f1a2b3c4d5e6f7g8h9i0j5"
    }
  }
};

// ========================================================================================
// BASIC VALIDATION TESTS
// ========================================================================================

/**
 * Basic validation test scenarios for wallet endpoints
 */
const validationTests = {
  // Test insufficient balance for withdrawal
  insufficientBalanceTest: {
    method: 'POST',
    url: '/withdrawals',
    body: {
      "amount": 999999.99,
      "payment_method": {
        "type": "bank_transfer",
        "details": {
          "account_number": "1234567890",
          "routing_number": "123456789",
          "account_holder_name": "John Doe",
          "bank_name": "Example Bank"
        }
      }
    },
    expectedError: {
      "success": false,
      "message": "Insufficient balance"
    }
  },

  // Test invalid payment method
  invalidPaymentMethodTest: {
    method: 'POST',
    url: '/withdrawals',
    body: {
      "amount": 50.00,
      "payment_method": {
        "type": "invalid_method"
      }
    },
    expectedError: {
      "success": false,
      "message": "Invalid payment method"
    }
  },

  // Test marking non-approved withdrawal as paid
  invalidStatusTest: {
    method: 'POST',
    url: '/admin/withdrawals/64f1a2b3c4d5e6f7g8h9i0j3/mark-paid',
    body: {},
    expectedError: {
      "message": "Only approved withdrawal requests can be marked as paid",
      "current_status": "Pending"
    }
  }
};

// ========================================================================================
// API ENDPOINT SUMMARY
// ========================================================================================

const endpointSummary = {
  seller_endpoints: [
    {
      method: 'GET',
      path: '/wallet',
      description: 'Get wallet balance and transaction history for mobile UI',
      auth: 'User JWT required',
      response: 'Simple { balance, history[] } structure'
    },
    {
      method: 'POST',
      path: '/wallet/refresh',
      description: 'Force refresh wallet balance',
      auth: 'User JWT required',
      response: 'Simple { balance } structure'
    },
    {
      method: 'POST',
      path: '/withdrawals',
      description: 'Create new withdrawal request',
      auth: 'User JWT required',
      response: 'Simple { success, message } structure'
    },
    {
      method: 'GET',
      path: '/withdrawals',
      description: 'Get seller\'s own withdrawal requests',
      auth: 'User JWT required',
      response: 'Simple { requests[] } structure'
    }
  ],

  admin_endpoints: [
    {
      method: 'GET',
      path: '/admin/withdrawals',
      description: 'Get all withdrawal requests for review',
      auth: 'Admin JWT required',
      pagination: 'Yes'
    },
    {
      method: 'POST',
      path: '/admin/withdrawals/:id/approve',
      description: 'Approve withdrawal request',
      auth: 'Admin JWT required',
      action: 'Moves funds from available to pending'
    },
    {
      method: 'POST',
      path: '/admin/withdrawals/:id/reject',
      description: 'Reject withdrawal request',
      auth: 'Admin JWT required',
      action: 'Releases held funds back to available'
    },
    {
      method: 'POST',
      path: '/admin/withdrawals/:id/mark-paid',
      description: 'Mark withdrawal as paid and finalize',
      auth: 'Admin JWT required',
      action: 'Creates SELLER_PAYOUT transaction'
    }
  ]
};

module.exports = {
  walletInfoExample,
  createWithdrawalExample,
  getWithdrawalsExample,
  adminGetWithdrawalsExample,
  adminMarkPaidExample,
  validationTests,
  endpointSummary
};
