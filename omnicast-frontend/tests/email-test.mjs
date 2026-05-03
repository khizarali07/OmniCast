import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import nodemailer from 'nodemailer';

async function testEmail() {
  console.log('Testing Brevo SMTP configuration...');

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"OmniCast" <${process.env.EMAIL_FROM || 'noreply@omnicast.ai'}>`,
      to: process.env.EMAIL_FROM, // Send to self for testing
      subject: 'Test Email from OmniCast',
      html: '<p>This is a test email to verify the SMTP configuration.</p>',
    });
    console.log('✅ Email sent successfully! Message ID:', info.messageId);
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    process.exit(1);
  }
}

testEmail();
