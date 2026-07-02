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

async function notifyApprovalWithPayment(applicant) {
  const name = `${applicant.fname}${applicant.lname ? ' ' + applicant.lname : ''}`;
  const type = applicant.seller_type || 'Seller';
  const loginUrl = process.env.APP_URL || 'http://localhost:3000';

  // To applicant via email
  await sendEmail(applicant.email, `Marutham Agrolink — Application Approved! Log in and Choose Your Plan`, `
    <p>Dear ${name},</p>
    <p>Congratulations! Your <strong>${type}</strong> application on <strong>Marutham Agrolink</strong> has been <span style="color:#16a34a;font-weight:700">APPROVED</span>.</p>
    <p>Your login is now active. To start selling, please log in and complete your subscription payment — choose the plan that suits you and pay online. A one-time registration charge of <strong>₹100</strong> applies on your first activation.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0">
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:130px">Login ID</td><td style="font-weight:700;font-family:monospace;font-size:15px">${applicant.login_id}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px">Registered Phone</td><td>${applicant.phone}</td></tr>
      </table>
    </div>
    <p style="margin:16px 0"><a href="${loginUrl}" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:700">Log in &amp; Choose Your Plan</a></p>
    <p>Log in with your Login ID / phone number and password (or OTP). You'll be prompted to select a subscription plan and pay — once payment succeeds, your product listings go live for selling.</p>
    <p>Regards,<br><strong>Marutham Agrolink Head Office</strong></p>
  `);

  // To applicant via SMS
  await sendSMS(applicant.phone,
    `Congrats ${applicant.fname}! Your Marutham Agrolink ${type} application is APPROVED. Login ID: ${applicant.login_id}. Log in at ${loginUrl} and pay your subscription (+ one-time Rs.100) to start selling. -Marutham Agrolink`
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

const FIELD_LABELS = {
  bank_name: 'Bank Name', bank_account: 'Account Number', ifsc: 'IFSC Code',
  gst_number: 'GST Number', business_name: 'Business Name', business_type: 'Business Type',
};

async function notifyProfileChangeRequest(user, changes) {
  const name = `${user.fname}${user.lname ? ' ' + user.lname : ''}`;
  const subject = `Approve my Profile update_${user.login_id}`;
  const rows = Object.entries(changes)
    .map(([k, v]) => `<tr><td style="padding:6px 8px;color:#6b7280;font-size:13px">${FIELD_LABELS[k] || k}</td><td style="font-weight:700">${v}</td></tr>`)
    .join('');

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await sendEmail(adminEmail, subject, `
      <p>A profile update request requires Head Office approval:</p>
      <table style="border-collapse:collapse;width:100%;max-width:480px;margin:12px 0">
        <tr><td style="padding:6px 8px;color:#6b7280;font-size:13px">Name</td><td><strong>${name}</strong></td></tr>
        <tr><td style="padding:6px 8px;color:#6b7280;font-size:13px">Login ID</td><td style="font-family:monospace;font-weight:700">${user.login_id}</td></tr>
        <tr><td style="padding:6px 8px;color:#6b7280;font-size:13px">Phone</td><td>${user.phone}</td></tr>
      </table>
      <h3 style="color:#1a3d2b;margin:0 0 8px">Requested Changes</h3>
      <table style="border-collapse:collapse;width:100%;max-width:480px;background:#f0fdf4;border-radius:8px">${rows}</table>
      <p><a href="${process.env.APP_URL || 'http://localhost:3000'}/admin.html"
        style="background:#16a34a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:12px">
        Review in Admin Portal</a></p>
    `);
  }

  if (user.email) {
    await sendEmail(user.email, `Profile Update Request Received — ${user.login_id}`, `
      <p>Dear ${name},</p>
      <p>Your profile update request has been submitted and is pending approval by the Head Office team.</p>
      <h3 style="color:#1a3d2b;margin:0 0 8px">Fields Requested for Change</h3>
      <table style="border-collapse:collapse;width:100%;max-width:480px;background:#f0fdf4;border-radius:8px">${rows}</table>
      <p>You will be notified by email once the request is reviewed.</p>
      <p>Regards,<br><strong>Marutham Agrolink Head Office</strong></p>
    `);
  }
}

async function notifyProfileChangeOutcome(user, status, notes, approverName) {
  const name = `${user.fname}${user.lname ? ' ' + user.lname : ''}`;
  const isApproved = status === 'approved';
  const subject = `Profile Update ${isApproved ? 'Approved' : 'Rejected'} — ${user.login_id}`;
  if (user.email) {
    await sendEmail(user.email, subject, `
      <p>Dear ${name},</p>
      <p>Your profile update request has been <strong style="color:${isApproved ? '#16a34a' : '#dc2626'}">${isApproved ? 'APPROVED' : 'REJECTED'}</strong> by the Head Office team.</p>
      ${notes ? `<div style="background:#f8f9fa;border-radius:8px;padding:14px;margin:12px 0"><strong>Notes:</strong> ${notes}</div>` : ''}
      ${isApproved ? '<p>Your profile has been updated with the requested changes.</p>' : '<p>The requested changes were not applied. Please contact support if you have questions.</p>'}
      <p>Regards,<br><strong>${approverName || 'Marutham Agrolink Head Office'}</strong></p>
    `);
  }
}

async function notifySubscriptionExpiring(user, daysLeft) {
  const name    = [user.fname, user.lname].filter(Boolean).join(' ');
  const expDate = user.subscription_expires_at
    ? new Date(user.subscription_expires_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';
  const urgency = daysLeft <= 1 ? '🚨 FINAL REMINDER' : daysLeft <= 5 ? '⚠️ Urgent' : '📅 Reminder';
  const subject = `${urgency}: Your Marutham Agrolink subscription expires in ${daysLeft} day(s) — ${user.login_id}`;
  if (user.email) {
    await sendEmail(user.email, subject, `
      <p>Dear ${name},</p>
      <p>This is a ${daysLeft <= 1 ? '<strong>final reminder</strong>' : 'reminder'} that your Marutham Agrolink subscription will expire on <strong>${expDate}</strong> — in <strong>${daysLeft} day(s)</strong>.</p>
      <p>Please contact the admin team to renew your subscription before the expiry date to avoid account lockout.</p>
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:14px;margin:12px 0">
        <strong>⚠️ Important:</strong> If your subscription expires, your account will be automatically locked and you will not be able to log in until it is renewed.
      </div>
      <p>Login ID: <strong>${user.login_id}</strong></p>
      <p>Regards,<br><strong>Marutham Agrolink Team</strong></p>
    `);
  }
}

async function notifySubscriptionExpired(user) {
  const name    = [user.fname, user.lname].filter(Boolean).join(' ');
  const subject = `Account Locked — Subscription Expired — ${user.login_id}`;
  if (user.email) {
    await sendEmail(user.email, subject, `
      <p>Dear ${name},</p>
      <p>Your Marutham Agrolink subscription has <strong style="color:#dc2626">expired</strong> and your account has been locked.</p>
      <p>Please contact the admin team immediately to renew your subscription and restore access.</p>
      <p>Login ID: <strong>${user.login_id}</strong></p>
      <p>Regards,<br><strong>Marutham Agrolink Team</strong></p>
    `);
  }
}

async function notifySubscriptionRenewalPaymentPending(user, plan, amountPaise, ref) {
  const name    = [user.fname, user.lname].filter(Boolean).join(' ');
  const amountRs = (amountPaise / 100).toFixed(0);
  const subject = `Action Required — Pay ₹${amountRs} to Renew Subscription — Ref: ${ref}`;
  if (user.email) {
    await sendEmail(user.email, subject, `
      <p>Dear ${name},</p>
      <p>Your subscription renewal request (<strong>${plan}</strong>) has been reviewed and approved.</p>
      <p>Please pay <strong>₹${amountRs}</strong> to complete the renewal.</p>
      ${paymentDetailsBlock()}
      <p><strong>Payment Reference:</strong> ${ref}<br>
      Please mention this reference when making the payment.</p>
      <p>Once payment is confirmed by our team, your account will be reactivated.</p>
      <p>Regards,<br><strong>Marutham Agrolink Team</strong></p>
    `);
  }
}

async function notifySubscriptionRenewalRequest(user, plan) {
  const name       = [user.fname, user.lname].filter(Boolean).join(' ');
  const adminEmail = process.env.ADMIN_EMAIL;
  const subject    = `Subscription Renewal Request — ${name} (${user.login_id})`;
  if (adminEmail) {
    await sendEmail(adminEmail, subject, `
      <p>A subscription renewal request has been submitted.</p>
      <p><strong>Name:</strong> ${name}<br>
      <strong>Login ID:</strong> ${user.login_id}<br>
      <strong>Requested Plan:</strong> ${plan}</p>
      <p>Please log in to the admin panel → Change Requests to review and approve.</p>
      <p>Regards,<br><strong>Marutham Agrolink System</strong></p>
    `);
  }
}

async function notifySubscriptionRenewalOutcome(user, approved, newExpiry, plan) {
  const name = [user.fname, user.lname].filter(Boolean).join(' ');
  if (approved) {
    const expStr = new Date(newExpiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    await sendEmail(user.email, `Subscription Renewed — Active until ${expStr}`, `
      <p>Dear ${name},</p>
      <p>Your <strong>${plan}</strong> subscription has been <strong style="color:#16a34a">renewed and is now active</strong>.</p>
      <p>Valid until: <strong>${expStr}</strong></p>
      <p>Login ID: <strong>${user.login_id}</strong></p>
      <p>Regards,<br><strong>Marutham Agrolink Team</strong></p>
    `);
  } else {
    await sendEmail(user.email, `Subscription Renewal Request — Not Approved`, `
      <p>Dear ${name},</p>
      <p>Your subscription renewal request has not been approved at this time.</p>
      <p>Please contact the admin team for more details.</p>
      <p>Login ID: <strong>${user.login_id}</strong></p>
      <p>Regards,<br><strong>Marutham Agrolink Team</strong></p>
    `);
  }
}

async function notifyProductApproved(farmer, product) {
  const name        = `${farmer.fname}${farmer.lname ? ' ' + farmer.lname : ''}`;
  const productName = product.name;

  await sendEmail(farmer.email, `Product Approved — You can now sell ${productName} on Marutham Agrolink`, `
    <p>Dear ${name},</p>
    <p>Great news! Your request to sell <strong>${productName}</strong> has been
    <span style="color:#16a34a;font-weight:700">APPROVED</span> by the admin team.</p>
    <p>You can now log in to the Farmer Portal and set your selling price:</p>
    <p style="margin:16px 0"><strong>My Products → Add Price to Sell → Select "${productName}" → Enter your price</strong></p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin:12px 0">
      <strong>Login ID:</strong> ${farmer.login_id}
    </div>
    <p>Regards,<br><strong>Marutham Agrolink Team</strong></p>
  `);

  await sendSMS(farmer.phone,
    `Congrats ${farmer.fname}! Your request to sell ${productName} on Marutham Agrolink is APPROVED. Login: ${farmer.login_id}. Go to My Products > Add Price to Sell. -Marutham Agrolink`
  );
}

module.exports = {
  notifyRegistrationReceived,
  notifyApprovalWithPayment,
  notifyAccountActivated,
  notifyRejection,
  notifyProfileChangeRequest,
  notifyProfileChangeOutcome,
  notifySubscriptionExpiring,
  notifySubscriptionExpired,
  notifySubscriptionRenewalRequest,
  notifySubscriptionRenewalPaymentPending,
  notifySubscriptionRenewalOutcome,
  notifyProductApproved,
};
