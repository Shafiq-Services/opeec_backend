const nodemailer = require('nodemailer');

// Create a transporter for sending emails
const createTransporter = () => {
  return nodemailer.createTransport({
    host: "smtp.hostinger.com",
    port: 465,              // use 465 for SSL, or 587 for TLS
    secure: true,           // true for 465, false for 587
    auth: {
      user: process.env.EMAIL,  // Your email address
      pass: process.env.EMAIL_PASSWORD   // Your email password or app-specific password
    }
  });
};

// Generic email sending function
const sendEmail = async (to, subject, htmlContent, textContent = null) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: 'OPEEC <' + process.env.EMAIL + '>',
      to: to,
      subject: subject,
      html: htmlContent,
      text: textContent || htmlContent.replace(/<[^>]*>/g, '') // Strip HTML if no text provided
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully to ${to}: ${subject}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw new Error('Failed to send email');
  }
};

// OTP Email Template
const sendOTPEmail = async (email, otp) => {
  const subject = 'Your OTP for Login Verification - OPEEC';
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>OTP Verification - OPEEC</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">OPEEC</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Equipment Rental Platform</p>
        </div>
        
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #ddd;">
            <h2 style="color: #333; margin-top: 0;">Verify Your Login</h2>
            
            <p>Hello,</p>
            
            <p>You've requested to log in to your OPEEC account. Please use the following One-Time Password (OTP) to complete your verification:</p>
            
            <div style="background: white; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                <h1 style="color: #667eea; margin: 0; font-size: 36px; letter-spacing: 8px; font-weight: bold;">${otp}</h1>
            </div>
            
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #856404;">
                    <strong>⏰ Important:</strong> This OTP is valid for <strong>10 minutes only</strong>. Please enter it immediately to avoid expiration.
                </p>
            </div>
            
            <p>If you didn't request this OTP, please ignore this email or contact our support team if you have concerns about your account security.</p>
            
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            
            <p style="font-size: 14px; color: #666;">
                <strong>OPEEC Team</strong><br>
                Equipment Rental Platform<br>
                <a href="mailto:support@opeec.com" style="color: #667eea;">support@opeec.com</a>
            </p>
        </div>
    </body>
    </html>
  `;

  const textContent = `
OPEEC - OTP Verification

Hello,

You've requested to log in to your OPEEC account. Please use the following One-Time Password (OTP):

OTP: ${otp}

This OTP is valid for 10 minutes only.

If you didn't request this OTP, please ignore this email.

OPEEC Team
Equipment Rental Platform
support@opeec.com
  `;

  return await sendEmail(email, subject, htmlContent, textContent);
};

// Admin Notification Email Template
const sendAdminNotificationEmail = async (adminEmail, notificationData) => {
  const { type, title, body, data } = notificationData;
  
  // Get notification type specific styling and content
  const notificationConfig = getNotificationEmailConfig(type);
  
  const subject = `🔔 OPEEC Admin Alert: ${title}`;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin Notification - OPEEC</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: ${notificationConfig.gradient}; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">OPEEC Admin</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">System Notification</p>
        </div>
        
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #ddd;">
            <div style="background: ${notificationConfig.color}; color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                <h2 style="margin: 0; font-size: 20px;">${notificationConfig.icon} ${title}</h2>
            </div>
            
            <div style="background: white; border-left: 4px solid ${notificationConfig.color}; padding: 20px; border-radius: 0 8px 8px 0; margin: 20px 0;">
                <p style="margin: 0; font-size: 16px; color: #333;">${body}</p>
            </div>
            
            ${data && Object.keys(data).length > 0 ? `
            <div style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #495057;">📊 Additional Details:</h3>
                ${generateDataSection(data)}
            </div>
            ` : ''}
            
            <div style="background: #e7f3ff; border: 1px solid #b8daff; border-radius: 5px; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #004085;">
                    <strong>💡 Action Required:</strong> Please review this notification in your admin dashboard for any necessary actions.
                </p>
            </div>
            

            
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            
            <p style="font-size: 14px; color: #666;">
                <strong>OPEEC Admin System</strong><br>
                Equipment Rental Platform<br>
                Time: ${new Date().toLocaleString()}<br>
                <a href="mailto:admin@opeec.com" style="color: ${notificationConfig.color};">admin@opeec.com</a>
            </p>
        </div>
    </body>
    </html>
  `;

  const textContent = `
OPEEC Admin Notification

${title}

${body}

${data && Object.keys(data).length > 0 ? `
Additional Details:
${Object.entries(data).map(([key, value]) => `${key}: ${value}`).join('\n')}
` : ''}

Please review this notification in your admin dashboard.

OPEEC Admin System
Time: ${new Date().toLocaleString()}
admin@opeec.com
  `;

  return await sendEmail(adminEmail, subject, htmlContent, textContent);
};

// Get notification type specific configuration
const getNotificationEmailConfig = (type) => {
  const configs = {
    user_registration: {
      color: '#3B82F6',
      gradient: 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)',
      icon: '👤'
    },
    user_verification_request: {
      color: '#F59E0B',
      gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
      icon: '✅'
    },
    user_appeal_request: {
      color: '#EF4444',
      gradient: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
      icon: '🚫'
    },
    equipment_submission: {
      color: '#10B981',
      gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
      icon: '📦'
    },
    equipment_resubmission: {
      color: '#8B5CF6',
      gradient: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
      icon: '🔄'
    },
    rental_booking: {
      color: '#059669',
      gradient: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
      icon: '📅'
    },
    late_return_alert: {
      color: '#DC2626',
      gradient: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
      icon: '⏰'
    },
    penalty_dispute: {
      color: '#F97316',
      gradient: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
      icon: '⚠️'
    }
  };

  return configs[type] || {
    color: '#6B7280',
    gradient: 'linear-gradient(135deg, #6B7280 0%, #4B5563 100%)',
    icon: '🔔'
  };
};

// Generate data section for email
const generateDataSection = (data) => {
  return Object.entries(data)
    .map(([key, value]) => {
      const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      const formattedValue = typeof value === 'object' ? JSON.stringify(value) : value;
      
      return `
        <div style="margin: 10px 0; padding: 8px 12px; background: white; border-radius: 4px; border-left: 3px solid #007bff;">
          <strong style="color: #495057;">${formattedKey}:</strong> 
          <span style="color: #6c757d;">${formattedValue}</span>
        </div>
      `;
    })
    .join('');
};

module.exports = {
  sendEmail,
  sendOTPEmail,
  sendAdminNotificationEmail
};
