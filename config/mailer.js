require('dotenv').config(); 


const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendVerificationEmail = async (to, token) => {
  const url = `http://localhost:3000/verify-email?token=${token}`;
  await transporter.sendMail({
    to,
    subject: 'Verify your email for UCclub',
    html: `Please click this link to verify your email: <a href="${url}">${url}</a>`,
  });
};

const sendPasswordResetEmail = async (to, token) => {
  const url = `http://localhost:3000/reset-password?token=${token}`;
  await transporter.sendMail({
    to,
    subject: 'Reset your password - UCclub',
    html: `You requested a password reset. Click to reset: <a href="${url}">${url}</a>. If you didn't request this, ignore this email.`,
  });
};

const sendRSVPEmail = async (to, event) => {
  await transporter.sendMail({
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
    await transporter.sendMail({
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error(`Failed to send notification email to ${to}:`, error);
  }
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendRSVPEmail, sendNotificationEmail };
