require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');
const cron = require('node-cron');
const Payment = require('./models/Payment');
const User = require('./models/User');
const nodemailer = require('nodemailer');
const { sendPaymentReminders } = require('./utils/notifications');
const connectDB = require('./config/database');
const fileUpload = require('express-fileupload');
const path = require('path');

const app = express();

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(fileUpload({
  createParentPath: true,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max file size
  },
}));

// Database connection with retry logic
connectDB();

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Karate School API',
      version: '1.0.0',
      description: 'API documentation for Karate School Management System',
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT}`,
      },
    ],
  },
  apis: ['./routes/*.js'],
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Update the static files middleware placement (move it before the routes)
// Add this after other middleware configurations but before routes
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/exams', require('./routes/exams'));

// Generate monthly payments (runs on 1st of every month)
cron.schedule('0 0 1 * *', async () => {
  try {
    const students = await User.find({ role: 'student', isBlocked: false });
    
    for (const student of students) {
      const amount = student.membershipPlan === '2classes' ? 14.99 :
                    student.membershipPlan === '3classes' ? 22.99 : 29.99;
      
      await Payment.create({
        student: student._id,
        amount,
        dueDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
        membershipPlan: student.membershipPlan
      });

      // Send email notification
      await transporter.sendMail({
        to: student.email,
        subject: 'Monthly Payment Due',
        text: `Your monthly payment of $${amount} is due. Please log in to make your payment.`
      });
    }
  } catch (error) {
    console.error('Error generating monthly payments:', error);
  }
});

// Check for overdue payments daily
cron.schedule('0 0 * * *', async () => {
  try {
    const overduePeriod = new Date();
    overduePeriod.setMonth(overduePeriod.getMonth() - 2);

    const overduePayments = await Payment.find({
      status: 'pending',
      dueDate: { $lte: overduePeriod }
    }).populate('student');

    for (const payment of overduePayments) {
      await User.findByIdAndUpdate(payment.student._id, { isBlocked: true });
      
      await transporter.sendMail({
        to: payment.student.email,
        subject: 'Account Blocked - Overdue Payments',
        text: `Your account has been blocked due to overdue payments. Please contact your instructor.`
      });
    }
  } catch (error) {
    console.error('Error checking overdue payments:', error);
  }
});

// Send payment reminders weekly
cron.schedule('0 9 * * 1', async () => {
  await sendPaymentReminders();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  // Don't exit the process in production, just log the error
  if (process.env.NODE_ENV === 'development') {
    process.exit(1);
  }
}); 