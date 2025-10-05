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

module.exports = { sendVerificationEmail };
