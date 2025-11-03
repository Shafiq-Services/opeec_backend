/**
 * Stripe Connect Page Redirects Controller
 * 
 * Handles the success and error redirects from Stripe Connect onboarding
 */

const User = require('../models/user');

/**
 * Handle successful Stripe Connect onboarding completion
 * GET /stripe-connect/success
 */
exports.handleOnboardingSuccess = async (req, res) => {
  try {
    // In a real app, you might want to extract user info from query params or session
    // For now, we'll show a generic success page
    
    console.log('✅ User completed Stripe Connect onboarding - redirected to success page');
    
    // You can customize this HTML or redirect to your frontend
    const successHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Stripe Connect Setup Complete - OPEEC</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                margin: 0;
                padding: 0;
                background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .container {
                background: white;
                padding: 3rem;
                border-radius: 12px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                text-align: center;
                max-width: 500px;
                width: 90%;
            }
            .success-icon {
                width: 80px;
                height: 80px;
                background: #10b981;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 2rem;
            }
            .checkmark {
                color: white;
                font-size: 2.5rem;
            }
            h1 {
                color: #1f2937;
                margin-bottom: 1rem;
                font-size: 1.875rem;
            }
            p {
                color: #6b7280;
                margin-bottom: 2rem;
                line-height: 1.6;
            }
            .info-box {
                background: #f3f4f6;
                padding: 1.5rem;
                border-radius: 8px;
                margin: 2rem 0;
                text-align: left;
            }
            .info-box h3 {
                color: #374151;
                margin: 0 0 1rem 0;
                font-size: 1.125rem;
            }
            .info-box ul {
                color: #6b7280;
                margin: 0;
                padding-left: 1.25rem;
            }
            .info-box li {
                margin-bottom: 0.5rem;
            }
            .button {
                background: #6366f1;
                color: white;
                padding: 0.75rem 1.5rem;
                border-radius: 6px;
                text-decoration: none;
                display: inline-block;
                margin: 0.5rem;
                transition: background-color 0.2s;
            }
            .button:hover {
                background: #4f46e5;
            }
            .button.secondary {
                background: #f3f4f6;
                color: #374151;
            }
            .button.secondary:hover {
                background: #e5e7eb;
            }
            .test-info {
                background: #fef3c7;
                border: 1px solid #f59e0b;
                padding: 1rem;
                border-radius: 6px;
                margin-top: 2rem;
                font-size: 0.875rem;
                color: #92400e;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="success-icon">
                <span class="checkmark">✓</span>
            </div>
            
            <h1>Bank Account Connected!</h1>
            <p>Your Stripe Connect account has been successfully set up. You can now receive automatic payouts from equipment rentals.</p>
            
            <div class="info-box">
                <h3>What happens next?</h3>
                <ul>
                    <li><strong>Status Update:</strong> Your account status will update to "Active" within a few minutes</li>
                    <li><strong>Automatic Payouts:</strong> When rentals complete, money will automatically transfer to your bank account</li>
                    <li><strong>Timeline:</strong> Payouts typically arrive in 2-7 business days</li>
                    <li><strong>Tracking:</strong> View all transfers in your wallet history</li>
                </ul>
            </div>
            
            <div class="test-info">
                <strong>🧪 Testing Mode:</strong> This is a test environment. No real money will be transferred.
            </div>
            
            <a href="#" onclick="returnToApp()" class="button">Return to App Now</a>
            <a href="#" onclick="window.close()" class="button secondary">Close Window</a>
        </div>

        <script>
            // Function to attempt returning to app
            function attemptAppReturn() {
                try {
                    // Try to open app via deep link
                    console.log('Attempting to return to app via deep link...');
                    window.location.href = 'opeec://stripe-connect/success';
                    
                    // Fallback: close browser after short delay
                    setTimeout(() => {
                        window.close();
                    }, 1000);
                } catch (error) {
                    console.log('Deep link failed, closing page');
                    window.close();
                }
            }
            
            // Auto-return to app after 3 seconds
            let timeLeft = 3;
            const timer = document.getElementById('timer');
            
            // Add a countdown timer to the page
            if (!timer) {
                const timerDiv = document.createElement('div');
                timerDiv.innerHTML = '<p style="margin-top: 1rem; color: #6b7280;">Returning to app in <span id="timer">3</span> seconds...</p>';
                document.querySelector('.container').appendChild(timerDiv);
            }
            
            const countdown = setInterval(() => {
                timeLeft--;
                const timerElement = document.getElementById('timer');
                if (timerElement) timerElement.textContent = timeLeft;
                
                if (timeLeft <= 0) {
                    clearInterval(countdown);
                    attemptAppReturn();
                }
            }, 1000);
            
            // Also try to return after 3 seconds
            setTimeout(() => {
                attemptAppReturn();
            }, 3000);
            
            // Manual return button handler
            function returnToApp() {
                attemptAppReturn();
            }
            
            // Log completion for analytics
            console.log('Stripe Connect onboarding completed:', {
                timestamp: new Date().toISOString()
            });
        </script>
    </body>
    </html>
    `;
    
    res.send(successHtml);
    
  } catch (error) {
    console.error('❌ Error handling onboarding success:', error);
    res.status(500).send(`
      <h1>Something went wrong</h1>
      <p>There was an error processing your request. Please try again.</p>
      <a href="/">Return to App</a>
    `);
  }
};

/**
 * Handle Stripe Connect onboarding refresh/retry
 * GET /stripe-connect/refresh
 */
exports.handleOnboardingRefresh = async (req, res) => {
  try {
    console.log('🔄 User needs to refresh Stripe Connect onboarding');
    
    const refreshHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Continue Setup - OPEEC</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                margin: 0;
                padding: 0;
                background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .container {
                background: white;
                padding: 3rem;
                border-radius: 12px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                text-align: center;
                max-width: 500px;
                width: 90%;
            }
            .warning-icon {
                width: 80px;
                height: 80px;
                background: #f59e0b;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 2rem;
            }
            .exclamation {
                color: white;
                font-size: 2.5rem;
                font-weight: bold;
            }
            h1 {
                color: #1f2937;
                margin-bottom: 1rem;
                font-size: 1.875rem;
            }
            p {
                color: #6b7280;
                margin-bottom: 2rem;
                line-height: 1.6;
            }
            .button {
                background: #f59e0b;
                color: white;
                padding: 0.75rem 1.5rem;
                border-radius: 6px;
                text-decoration: none;
                display: inline-block;
                margin: 0.5rem;
                transition: background-color 0.2s;
            }
            .button:hover {
                background: #d97706;
            }
            .button.secondary {
                background: #f3f4f6;
                color: #374151;
            }
            .button.secondary:hover {
                background: #e5e7eb;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="warning-icon">
                <span class="exclamation">!</span>
            </div>
            
            <h1>Setup Incomplete</h1>
            <p>Your bank account setup was not completed. You'll need to finish the process to start receiving automatic payouts.</p>
            
            <p><strong>What to do:</strong></p>
            <ul style="text-align: left; color: #6b7280;">
                <li>Return to the app</li>
                <li>Go to your wallet settings</li>
                <li>Tap "Continue Setup" to retry</li>
            </ul>
            
            <a href="#" onclick="returnToApp()" class="button">Return to App Now</a>
            <a href="#" onclick="window.close()" class="button secondary">Close Window</a>
        </div>

        <script>
            // Function to attempt returning to app
            function attemptAppReturn() {
                try {
                    // Try to open app via deep link (refresh flow)
                    console.log('Attempting to return to app via deep link (refresh)...');
                    window.location.href = 'opeec://stripe-connect/refresh';
                    
                    // Fallback: close browser after short delay
                    setTimeout(() => {
                        window.close();
                    }, 1000);
                } catch (error) {
                    console.log('Deep link failed, closing page');
                    window.close();
                }
            }
            
            // Auto-return to app after 5 seconds (longer delay for user to read the message)
            let timeLeft = 5;
            
            // Add a countdown timer to the page
            const timerDiv = document.createElement('div');
            timerDiv.innerHTML = '<p style="margin-top: 1rem; color: #6b7280;">Returning to app in <span id="timer">5</span> seconds...</p>';
            document.querySelector('.container').appendChild(timerDiv);
            
            const countdown = setInterval(() => {
                timeLeft--;
                const timerElement = document.getElementById('timer');
                if (timerElement) timerElement.textContent = timeLeft;
                
                if (timeLeft <= 0) {
                    clearInterval(countdown);
                    attemptAppReturn();
                }
            }, 1000);
            
            // Also try to return after 5 seconds
            setTimeout(() => {
                attemptAppReturn();
            }, 5000);
            
            // Manual return button handler
            function returnToApp() {
                attemptAppReturn();
            }
            
            // Log refresh for analytics
            console.log('Stripe Connect onboarding refresh:', {
                timestamp: new Date().toISOString()
            });
        </script>
    </body>
    </html>
    `;
    
    res.send(refreshHtml);
    
  } catch (error) {
    console.error('❌ Error handling onboarding refresh:', error);
    res.status(500).send(`
      <h1>Something went wrong</h1>
      <p>There was an error processing your request. Please try again.</p>
      <a href="/">Return to App</a>
    `);
  }
};
