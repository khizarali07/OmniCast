export function getVerificationEmailHtml(otpCode: string, verifyUrl: string) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify your OmniCast account</title>
    </head>
    <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 0;">
      <div style="max-width: 600px; margin: 40px auto; background-color: #1e293b; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #9d50bb 0%, #6e48aa 100%); padding: 50px 20px; text-align: center;">
          <div style="font-size: 36px; font-weight: 800; color: white; letter-spacing: -0.04em; text-shadow: 0 2px 10px rgba(0,0,0,0.2);">Sonic AI</div>
          <div style="color: rgba(255,255,255,0.8); font-size: 14px; margin-top: 8px; font-weight: 500; text-transform: uppercase; letter-spacing: 2px;">Professional Voice Suite</div>
        </div>
        
        <!-- Content -->
        <div style="padding: 50px 40px; text-align: center;">
          <h1 style="font-size: 28px; font-weight: 700; margin-bottom: 20px; color: white; letter-spacing: -0.02em;">Verify your identity</h1>
          <p style="font-size: 16px; line-height: 1.8; color: #94a3b8; margin-bottom: 40px; font-weight: 400;">
            Welcome to the future of voice cloning. To finalize your account setup, please use the secure code below.
          </p>
          
          <!-- Code Box -->
          <div style="background-color: #0f172a; padding: 30px; border-radius: 20px; display: inline-block; margin-bottom: 40px; border: 2px solid rgba(157, 80, 187, 0.4); box-shadow: inset 0 2px 10px rgba(0,0,0,0.5);">
            <div style="font-size: 48px; font-weight: 800; letter-spacing: 16px; color: #9d50bb; margin: 0; padding-left: 16px; font-family: 'Courier New', Courier, monospace;">${otpCode}</div>
          </div>
          
          <div style="margin-bottom: 40px;">
            <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #9d50bb 0%, #6e48aa 100%); color: white !important; text-decoration: none; padding: 20px 40px; border-radius: 16px; font-weight: 700; font-size: 18px; box-shadow: 0 10px 20px rgba(157, 80, 187, 0.3);">Verify Account Automatically</a>
          </div>
          
          <p style="font-size: 14px; color: #64748b; margin-top: 20px;">
            This secure code will expire in 10 minutes.<br>
            If you didn't create an account, you can safely ignore this email.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="padding: 40px; text-align: center; background-color: rgba(0,0,0,0.2); border-top: 1px solid rgba(255, 255, 255, 0.05);">
          <div style="font-size: 14px; color: #475569; font-weight: 500;">
            &copy; 2024 OmniCast AI. All rights reserved.
          </div>
          <div style="font-size: 12px; color: #334155; margin-top: 10px;">
            You're receiving this because you signed up for OmniCast.
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}
