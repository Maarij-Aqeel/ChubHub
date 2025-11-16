require('dotenv').config();

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendVerificationEmail = async (to, token) => {
  const url = `${process.env.APP_URL}/verify-email?token=${token}`;
  await resend.emails.send({
    from: process.env.ADMIN_EMAIL,
    to,
    subject: 'Verify your email for Uchub',
    html: `Please click this link to verify your email: <a href="${url}">${url}</a>`,
  });
};

const sendPasswordResetEmail = async (to, token) => {
  const url = `${process.env.APP_URL}/reset-password?token=${token}`;
  await resend.emails.send({
    from: process.env.ADMIN_EMAIL,
    to,
    subject: 'Reset your password - Uchub',
    html: `You requested a password reset. Click to reset: <a href="${url}">${url}</a>. If you didn't request this, ignore this email.`,
  });
};

const sendRSVPEmail = async (to, event) => {
  await resend.emails.send({
    from: process.env.ADMIN_EMAIL,
    to,
    subject: `RSVP Confirmed: ${event.title}`,
    html: `You RSVPed for <strong>${event.title}</strong> at ${event.location || 'TBA'} on ${event.startsAt ? new Date(event.startsAt).toLocaleString() : 'TBA'}.`,
  });
};

const sendNotificationEmail = async (to, clubName, itemType, itemTitle, itemDescription) => {
  const subject = `New ${itemType} from ${clubName}`;
  let html = `<p>Hello,</p>
<p>${clubName} has posted a new ${itemType}:</p>`;
  if (itemTitle) {
    html += `<p><strong>Title:</strong> ${itemTitle}</p>`;
  }
  if (itemDescription) {
    html += `<p><strong>Description:</strong> ${itemDescription}</p>`;
  }
  html += `<p>Check it out on the platform!</p>`;

  try {
    await resend.emails.send({
      from: process.env.ADMIN_EMAIL,
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error(`Failed to send notification email to ${to}:`, error);
  }
};

const sendApprovalEmail = async (to, itemType, status, notes) => {
  const subject = `${itemType} ${status.charAt(0).toUpperCase() + status.slice(1)} Notification`;
  let html = `<p>Hello,</p>`;

  if (status === 'approved') {
    html += `<p>Your ${itemType} has been approved.</p>`;
  } else {
    html += `<p>Your ${itemType} has been rejected.</p>`;
    if (notes) html += `<p><strong>Admin Notes:</strong> ${notes}</p>`;
  }

  html += `<p>Regards,<br>ChubHub Admin</p>`;

  console.log(`Sending ${status} email for ${itemType} to ${to}`);
  try {
    await resend.emails.send({
      from: process.env.ADMIN_EMAIL,
      to,
      subject,
      html,
    });
    console.log(`Successfully sent ${status} email for ${itemType} to ${to}`);
  } catch (error) {
    console.error(`Failed to send approval email to ${to}:`, error);
  }
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendRSVPEmail, sendNotificationEmail, sendApprovalEmail };
