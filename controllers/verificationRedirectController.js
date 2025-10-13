const User = require('../models/user');
const { sendEventToUser } = require('../utils/socketService');

/**
 * Professional Stripe Identity Verification Redirect Handler
 * 
 * Handles all verification redirect scenarios:
 * - Success: Verification completed successfully
 * - Failure: Verification failed (documents rejected, etc.)
 * - Processing: Still being processed by Stripe
 * - Canceled: User canceled the verification process
 * - Requires_input: Additional input needed
 */

/**
 * Handle verification redirect from Stripe
 * GET /verification-complete
 * 
 * Query parameters from Stripe:
 * - session_id: Stripe verification session ID
 * - status: verification status from Stripe redirect
 * 
 * NOTE: This handler ONLY shows UI. Database updates are handled by webhook.
 */
const handleVerificationRedirect = async (req, res) => {
  try {
    const { session_id, status } = req.query;
    
    console.log(`🔄 Verification redirect received:`, {
      session_id,
      status,
      query: req.query
    });

    // Default response data
    let responseData = {
      title: 'Verification Status',
      message: 'Your verification status has been updated.',
      status: 'pending',
      icon: '⏳',
      color: '#ffc107',
      autoClose: true,
      closeDelay: 5000
    };

    // Get current user verification status from database (read-only)
    let currentStatus = 'pending';
    if (session_id) {
      const userStatus = await getUserVerificationStatus(session_id);
      if (userStatus) {
        currentStatus = userStatus;
        console.log(`📖 Current user verification status: ${currentStatus}`);
      }
    }

    // Handle different verification scenarios (UI ONLY - no database updates)
    switch (status || currentStatus) {
      case 'verified':
      case 'success':
        responseData = {
          title: 'Verification Successful! ✅',
          message: 'Your identity has been verified successfully. You can now rent equipment and access all features.',
          status: 'verified',
          icon: '✅',
          color: '#28a745',
          autoClose: true,
          closeDelay: 3000
        };
        break;

      case 'requires_input':
      case 'failure':
      case 'failed':
        responseData = {
          title: 'Verification Needs Attention ⚠️',
          message: 'Additional information or clearer documents are needed. Please try again or contact support.',
          status: 'failed',
          icon: '⚠️',
          color: '#dc3545',
          autoClose: false,
          closeDelay: 0
        };
        break;

      case 'canceled':
      case 'consent_declined':
        responseData = {
          title: 'Verification Canceled ❌',
          message: 'Identity verification was canceled. You can restart the process anytime from the app.',
          status: 'canceled',
          icon: '❌',
          color: '#6c757d',
          autoClose: true,
          closeDelay: 4000
        };
        break;

      case 'processing':
      case 'pending':
      default:
        responseData = {
          title: 'Verification In Progress ⏳',
          message: 'Your documents are being reviewed. You\'ll receive a notification once complete (usually within 24 hours).',
          status: 'processing',
          icon: '⏳',
          color: '#17a2b8',
          autoClose: true,
          closeDelay: 5000
        };
        break;
    }

    // Render professional response page
    const htmlResponse = generateVerificationPage(responseData);
    res.status(200).send(htmlResponse);

  } catch (error) {
    console.error('❌ Error handling verification redirect:', error);
    
    // Fallback error page
    const errorPage = generateVerificationPage({
      title: 'Verification Error',
      message: 'There was an issue processing your verification. Please contact support or try again.',
      status: 'error',
      icon: '❌',
      color: '#dc3545',
      autoClose: false,
      closeDelay: 0
    });
    
    res.status(500).send(errorPage);
  }
};

/**
 * Get user verification status from database (read-only)
 */
async function getUserVerificationStatus(sessionId) {
  try {
    const user = await User.findOne({
      'stripe_verification.session_id': sessionId
    }).select('stripe_verification.status');

    if (!user || !user.stripe_verification) {
      console.log(`⚠️ User not found for session: ${sessionId}`);
      return null;
    }

    return user.stripe_verification.status;
  } catch (error) {
    console.error('❌ Error reading user verification status:', error);
    return null;
  }
}

/**
 * Get user-friendly status message
 */
function getStatusMessage(status) {
  const messages = {
    'verified': 'Your identity has been verified successfully! You can now rent equipment.',
    'failed': 'Your verification needs attention. Please check the app for next steps.',
    'pending': 'Your verification is being reviewed. You\'ll be notified once complete.',
    'not_verified': 'Verification was canceled. You can restart anytime from the app.'
  };
  
  return messages[status] || 'Your verification status has been updated.';
}

/**
 * Generate professional HTML page for verification results
 */
function generateVerificationPage(data) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${data.title}</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            
            .container {
                background: white;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                padding: 40px;
                text-align: center;
                max-width: 500px;
                width: 100%;
                animation: slideUp 0.5s ease-out;
            }
            
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(30px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .icon {
                font-size: 4rem;
                margin-bottom: 20px;
                display: block;
            }
            
            .title {
                color: ${data.color};
                font-size: 1.8rem;
                font-weight: 600;
                margin-bottom: 15px;
                line-height: 1.3;
            }
            
            .message {
                color: #666;
                font-size: 1.1rem;
                line-height: 1.6;
                margin-bottom: 30px;
            }
            
            .status-badge {
                display: inline-block;
                background: ${data.color}20;
                color: ${data.color};
                padding: 8px 20px;
                border-radius: 25px;
                font-weight: 500;
                font-size: 0.9rem;
                margin-bottom: 30px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .button {
                background: ${data.color};
                color: white;
                border: none;
                padding: 15px 30px;
                border-radius: 50px;
                font-size: 1.1rem;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.3s ease;
                text-decoration: none;
                display: inline-block;
                margin-right: 15px;
            }
            
            .button:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 20px rgba(0,0,0,0.2);
            }
            
            .button.secondary {
                background: transparent;
                color: ${data.color};
                border: 2px solid ${data.color};
            }
            
            .countdown {
                color: #999;
                font-size: 0.9rem;
                margin-top: 20px;
            }
            
            .footer {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #eee;
                color: #999;
                font-size: 0.9rem;
            }
            
            @media (max-width: 480px) {
                .container {
                    padding: 30px 20px;
                }
                
                .title {
                    font-size: 1.5rem;
                }
                
                .message {
                    font-size: 1rem;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="icon">${data.icon}</div>
            <h1 class="title">${data.title}</h1>
            <div class="status-badge">${data.status}</div>
            <p class="message">${data.message}</p>
            
            <div>
                <button class="button" onclick="window.close()">Close This Page</button>
                <a href="opeec://verification/complete" class="button secondary">Return to App</a>
            </div>
            
            ${data.autoClose ? `
                <div class="countdown" id="countdown">
                    This page will close automatically in <span id="timer">${Math.floor(data.closeDelay / 1000)}</span> seconds
                </div>
            ` : ''}
            
            <div class="footer">
                <p>Return to the app to continue using all features</p>
            </div>
        </div>
        
        <script>
            ${data.autoClose ? `
                let timeLeft = ${Math.floor(data.closeDelay / 1000)};
                const timer = document.getElementById('timer');
                
                const countdown = setInterval(() => {
                    timeLeft--;
                    if (timer) timer.textContent = timeLeft;
                    
                    if (timeLeft <= 0) {
                        clearInterval(countdown);
                        attemptAppReturn();
                    }
                }, 1000);
                
                // Also try to close after the specified delay
                setTimeout(() => {
                    attemptAppReturn();
                }, ${data.closeDelay});
            ` : ''}
            
            // Function to attempt returning to app
            function attemptAppReturn() {
                try {
                    // Try to open app via deep link
                    window.location.href = 'opeec://verification/complete';
                    
                    // Fallback: close browser after short delay
                    setTimeout(() => {
                        window.close();
                    }, 1000);
                } catch (error) {
                    console.log('Deep link failed, closing page');
                    window.close();
                }
            }
            
            // Log verification completion for analytics
            console.log('Verification redirect completed:', {
                status: '${data.status}',
                timestamp: new Date().toISOString()
            });
        </script>
    </body>
    </html>
  `;
}

module.exports = {
  handleVerificationRedirect
};
