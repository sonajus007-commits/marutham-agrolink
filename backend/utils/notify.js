const nodemailer = require('nodemailer');

function getTransporter() {
  if (!process.env.SMTP_USER) return null;
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendEmail(to, subject, html) {
  if (!to) return;
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[EMAIL-SANDBOX] To: ${to}\nSubject: ${subject}`);
    return;
  }
  await transporter.sendMail({
    from: `"Marutham Agrolink" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
}

async function sendSMS(phone, message) {
  if (!phone) return;
  const key = process.env.MSG91_AUTH_KEY;
  if (!key) {
    console.log(`[SMS-SANDBOX] To: ${phone}\n${message}`);
    return;
  }
  // MSG91 transactional SMS
  const sender = process.env.MSG91_SENDER || 'MARUTH';
  await fetch(`https://control.msg91.com/api/sendhttp.php?authkey=${key}&mobiles=91${phone}&message=${encodeURIComponent(message)}&sender=${sender}&route=4&country=91`);
}

function paymentDetailsBlock() {
  return `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0">
      <strong style="color:#15803d">Payment Details</strong><br><br>
      ${process.env.BANK_UPI_ID ? `<b>UPI ID:</b> ${process.env.BANK_UPI_ID}<br>` : ''}
      ${process.env.BANK_NAME ? `<b>Bank:</b> ${process.env.BANK_NAME}<br>` : ''}
      ${process.env.BANK_ACCOUNT_NO ? `<b>Account No:</b> ${process.env.BANK_ACCOUNT_NO}<br>` : ''}
      ${process.env.BANK_IFSC ? `<b>IFSC:</b> ${process.env.BANK_IFSC}<br>` : ''}
      <br><em style="color:#6b7280;font-size:13px">Include your Payment Reference in the transfer remarks so we can verify your payment quickly.</em>
    </div>`;
}

// ── Notification templates ────────────────────────────────────────────────────

async function notifyRegistrationReceived(applicant) {
  const name = `${applicant.fname}${applicant.lname ? ' ' + applicant.lname : ''}`;
  const type = applicant.seller_type || 'Seller';

  // To applicant via email
  await sendEmail(applicant.email, `Marutham Agrolink — Registration Received (${applicant.login_id})`, `
    <p>Dear ${name},</p>
    <p>Thank you for registering as a <strong>${type}</strong> on <strong>Marutham Agrolink</strong>.</p>
    <p>Your application has been received and is currently <strong>under review</strong> by our Head Office team.</p>
    <table style="border-collapse:collapse;width:100%;max-width:400px;margin:16px 0">
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px">Login ID</td><td style="font-weight:700;font-family:monospace">${applicant.login_id}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px">Phone</td><td>${applicant.phone}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px">District</td><td>${applicant.district}, ${applicant.state}</td></tr>
    </table>
    <p>You will be notified once your application is reviewed. If approved, you will receive a payment link to complete your subscription and activate your account.</p>
    <p style="color:#6b7280;font-size:13px">If you have any questions, contact us at ${process.env.SUPPORT_PHONE || process.env.SMTP_USER || 'our support team'}.</p>
    <p>Regards,<br><strong>Marutham Agrolink Head Office</strong></p>
  `);

  // To applicant via SMS
  await sendSMS(applicant.phone,
    `Dear ${applicant.fname}, your ${type} registration on Marutham Agrolink is received. Login ID: ${applicant.login_id}. Our team will review your application and contact you. -Marutham Agrolink`
  );

  // To admin
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await sendEmail(adminEmail, `New ${type} Registration — ${name} (${applicant.district})`, `
      <p>A new <strong>${type}</strong> has applied for registration:</p>
      <table style="border-collapse:collapse;width:100%;max-width:400px">
        <tr><td style="padding:6px 8px;color:#6b7280;font-size:13px">Name</td><td><strong>${name}</strong></td></tr>
        <tr><td style="padding:6px 8px;color:#6b7280;font-size:13px">Phone</td><td>${applicant.phone}</td></tr>
        <tr><td style="padding:6px 8px;color:#6b7280;font-size:13px">Email</td><td>${applicant.email || '—'}</td></tr>
        <tr><td style="padding:6px 8px;color:#6b7280;font-size:13px">Login ID</td><td style="font-family:monospace">${applicant.login_id}</td></tr>
        <tr><td style="padding:6px 8px;color:#6b7280;font-size:13px">District</td><td>${applicant.district}, ${applicant.state}</td></tr>
        ${type === 'Farmer' ? `
        <tr><td style="padding:6px 8px;color:#6b7280;font-size:13px">Aadhaar</td><td>${applicant.aadhar || '—'}</td></tr>
        <tr><td style="padding:6px 8px;color:#6b7280;font-size:13px">Bank</td><td>${applicant.bank_name || '—'}, ${applicant.bank_account || '—'}</td></tr>
        ` : `
        <tr><td style="padding:6px 8px;color:#6b7280;font-size:13px">Business</td><td>${applicant.business_name || '—'}</td></tr>
        <tr><td style="padding:6px 8px;color:#6b7280;font-size:13px">GST</td><td>${applicant.gst_number || '—'}</td></tr>
        `}
      </table>
      <p><a href="${process.env.APP_URL || 'http://localhost:3000'}/admin.html" style="background:#16a34a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:12px">Review in Admin Portal</a></p>
    `);
  }
}

async function notifyApprovalWithPayment(applicant, subscriptionAmountPaise) {
  const name = `${applicant.fname}${applicant.lname ? ' ' + applicant.lname : ''}`;
  const type = applicant.seller_type || 'Seller';
  const amountRs = (subscriptionAmountPaise / 100).toFixed(2);

  // To applicant via email
  await sendEmail(applicant.email, `Marutham Agrolink — Application Approved! Complete Payment to Activate`, `
    <p>Dear ${name},</p>
    <p>Congratulations! Your <strong>${type}</strong> application on <strong>Marutham Agrolink</strong> has been <span style="color:#16a34a;font-weight:700">APPROVED</span>.</p>
    <p>To activate your account, please complete your annual subscription payment:</p>
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:16px 0">
      <div style="font-size:24px;font-weight:700;color:#c2410c">₹${amountRs}</div>
      <div style="color:#6b7280;font-size:13px;margin-top:4px">Annual Subscription Fee</div>
      <div style="margin-top:12px;font-size:14px"><strong>Payment Reference:</strong> <span style="font-family:monospace;background:#fff3e0;padding:4px 8px;border-radius:4px;font-weight:700">${applicant.payment_reference}</span></div>
    </div>
    ${paymentDetailsBlock()}
    <p><strong>Important:</strong> Please include your Payment Reference <strong>${applicant.payment_reference}</strong> in the transfer remarks. Your account will be activated within 24 hours of payment confirmation.</p>
    <table style="border-collapse:collapse;width:100%;max-width:400px;margin:16px 0">
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px">Your Login ID</td><td style="font-weight:700;font-family:monospace">${applicant.login_id}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px">Registered Phone</td><td>${applicant.phone}</td></tr>
    </table>
    <p>Once payment is confirmed, you will receive your login credentials and can begin using the platform.</p>
    <p>Regards,<br><strong>Marutham Agrolink Head Office</strong></p>
  `);

  // To applicant via SMS
  await sendSMS(applicant.phone,
    `Congrats ${applicant.fname}! Your Marutham Agrolink ${type} application is APPROVED. Pay Rs.${amountRs} (Ref: ${applicant.payment_reference}) to ${process.env.BANK_UPI_ID || 'our bank account'}. Login ID: ${applicant.login_id}. Account activates after payment. -Marutham Agrolink`
  );
}

async function notifyAccountActivated(applicant) {
  const name = `${applicant.fname}${applicant.lname ? ' ' + applicant.lname : ''}`;
  const type = applicant.seller_type || 'Seller';
  const expiresAt = applicant.subscription_expires_at
    ? new Date(applicant.subscription_expires_at).toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' })
    : '1 year from activation';

  // To applicant via email
  await sendEmail(applicant.email, `Marutham Agrolink — Your Account is Now ACTIVE!`, `
    <p>Dear ${name},</p>
    <p>Your payment has been confirmed and your <strong>${type}</strong> account on <strong>Marutham Agrolink</strong> is now <span style="color:#16a34a;font-weight:700">ACTIVE</span>!</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0">
      <strong style="color:#15803d;font-size:15px">Your Login Credentials</strong><br><br>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:130px">Login ID</td><td style="font-weight:700;font-family:monospace;font-size:15px">${applicant.login_id}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px">Phone</td><td>${applicant.phone}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px">Subscription Valid Until</td><td><strong>${expiresAt}</strong></td></tr>
      </table>
    </div>
    <p><strong>How to Login:</strong><br>
    Visit <a href="${process.env.APP_URL || 'http://localhost:3000'}">${process.env.APP_URL || 'Marutham Agrolink'}</a> and use your Login ID or phone number with the password you set during registration.</p>
    <p>If you forgot your password, use the "Forgot Password" option on the login page.</p>
    <p>Welcome aboard! We look forward to growing together.</p>
    <p>Regards,<br><strong>Marutham Agrolink Head Office</strong></p>
  `);

  // To applicant via SMS
  await sendSMS(applicant.phone,
    `Welcome to Marutham Agrolink, ${applicant.fname}! Your account is ACTIVE. Login ID: ${applicant.login_id}. Use your registered phone & password to login at ${process.env.APP_URL || 'our platform'}. Valid till ${expiresAt}. -Marutham Agrolink`
  );
}

async function notifyRejection(applicant, reason) {
  const name = `${applicant.fname}${applicant.lname ? ' ' + applicant.lname : ''}`;
  const type = applicant.seller_type || 'Seller';

  await sendEmail(applicant.email, `Marutham Agrolink — Registration Update`, `
    <p>Dear ${name},</p>
    <p>Thank you for your interest in joining <strong>Marutham Agrolink</strong> as a <strong>${type}</strong>.</p>
    <p>After reviewing your application, we are unable to approve your registration at this time.</p>
    ${reason ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;margin:16px 0"><strong>Reason:</strong> ${reason}</div>` : ''}
    <p>If you believe this is an error or would like to reapply with updated details, please contact us at ${process.env.SUPPORT_PHONE || process.env.SMTP_USER || 'our support team'}.</p>
    <p>Regards,<br><strong>Marutham Agrolink Head Office</strong></p>
  `);

  await sendSMS(applicant.phone,
    `Dear ${applicant.fname}, your Marutham Agrolink ${type} registration could not be approved${reason ? ': ' + reason.slice(0, 80) : ''}. Contact us for assistance. -Marutham Agrolink`
  );
}

module.exports = {
  notifyRegistrationReceived,
  notifyApprovalWithPayment,
  notifyAccountActivated,
  notifyRejection,
};
