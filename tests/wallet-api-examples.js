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
 * 
 * Note: Payment method is handled via chat between admin and user
 */
const createWithdrawalExample = {
  method: 'POST',
  url: '/withdrawals',
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    'Content-Type': 'application/json'
  },
  body: {
    "amount": 100.00
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
        "rejection_reason": "",
        "transaction_id": ""
      },
      {
        "id": "64f1a2b3c4d5e6f7g8h9i0j4",
        "amount": 75.00,
        "status": "Approved",
        "date": "2024-01-10T09:30:00.000Z",
        "time": "09:30 AM",
        "rejection_reason": "",
        "transaction_id": ""
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
        "rejection_reason": "",
        "reviewed_by": null,
        "transaction_id": "TXN_98765",
        "screenshot_url": "https://uploads.example.com/proof.jpg",
        "payment_notes": "Wire transfer completed",
        "createdAt": "2024-01-15T14:20:00.000Z"
      }
    ]
  }
};

/**
 * POST /admin/withdrawals/:id/mark-paid - Mark withdrawal as paid with proof
 * 
 * Headers:
 * Authorization: Bearer {admin_jwt_token}
 * 
 * Body:
 * - transaction_id (REQUIRED): External payment transaction ID
 * - screenshot_url (optional): Screenshot of payment proof (admin only)
 * - notes (optional): Additional payment notes
 */
const adminMarkPaidExample = {
  method: 'POST',
  url: '/admin/withdrawals/64f1a2b3c4d5e6f7g8h9i0j3/mark-paid',
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    'Content-Type': 'application/json'
  },
  body: {
    "transaction_id": "TXN_12345678",
    "screenshot_url": "https://uploads.example.com/payment_screenshot.jpg",
    "notes": "Payment processed via wire transfer"
  },
  expectedResponse: {
    "message": "Withdrawal request marked as paid successfully",
    "withdrawal_request": {
      "_id": "64f1a2b3c4d5e6f7g8h9i0j3",
      "status": "Paid",
      "amount": 100.00,
      "transaction_id": "TXN_12345678",
      "screenshot_url": "https://uploads.example.com/payment_screenshot.jpg",
      "notes": "Payment processed via wire transfer",
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
      "amount": 999999.99
    },
    expectedError: {
      "success": false,
      "message": "Insufficient balance"
    }
  },

  // Test missing amount
  missingAmountTest: {
    method: 'POST',
    url: '/withdrawals',
    body: {},
    expectedError: {
      "success": false,
      "message": "Valid withdrawal amount is required"
    }
  },

  // Test marking non-approved withdrawal as paid
  invalidStatusTest: {
    method: 'POST',
    url: '/admin/withdrawals/64f1a2b3c4d5e6f7g8h9i0j3/mark-paid',
    body: {
      "transaction_id": "TXN_123"
    },
    expectedError: {
      "message": "Only approved withdrawal requests can be marked as paid",
      "current_status": "Pending"
    }
  },

  // Test missing transaction ID
  missingTransactionIdTest: {
    method: 'POST',
    url: '/admin/withdrawals/64f1a2b3c4d5e6f7g8h9i0j3/mark-paid',
    body: {},
    expectedError: {
      "message": "Transaction ID is required when marking as paid"
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
      description: 'Create new withdrawal request (payment method arranged via chat)',
      auth: 'User JWT required',
      required: 'amount only',
      response: 'Simple { success, message } structure'
    },
    {
      method: 'GET',
      path: '/withdrawals',
      description: 'Get seller\'s own withdrawal requests',
      auth: 'User JWT required',
      response: 'Simple { requests[] } structure with transaction_id (payment method handled via chat)'
    }
  ],

  admin_endpoints: [
    {
      method: 'GET',
      path: '/admin/withdrawals',
      description: 'Get all withdrawal requests for admin review',
      auth: 'Admin JWT required',
      response: 'Includes transaction_id, screenshot_url, and payment_notes for admin'
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
      description: 'Mark withdrawal as paid with external transaction proof',
      auth: 'Admin JWT required',
      required: 'transaction_id (external payment reference)',
      optional: 'screenshot_url (admin proof), notes',
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
