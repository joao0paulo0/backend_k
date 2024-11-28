const nodemailer = require('nodemailer');
const User = require('../models/User');
const Payment = require('../models/Payment');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

exports.sendPaymentReminders = async () => {
  try {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7); // 7 days before due date

    const upcomingPayments = await Payment.find({
      status: 'pending',
      dueDate: { $lte: dueDate }
    }).populate('student');

    for (const payment of upcomingPayments) {
      await transporter.sendMail({
        to: payment.student.email,
        subject: 'Payment Reminder',
        text: `Your payment of $${payment.amount} is due on ${payment.dueDate.toLocaleDateString()}. Please log in to make your payment.`
      });
    }
  } catch (error) {
    console.error('Error sending payment reminders:', error);
  }
}; 