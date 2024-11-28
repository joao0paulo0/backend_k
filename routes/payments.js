const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Generate monthly payments (runs on 1st of every month)
cron.schedule('0 0 1 * *', async () => {
  try {
    const students = await User.find({ role: 'student', isBlocked: false });
    
    for (const student of students) {
      const amount = student.membershipPlan === '2classes' ? 14.99 :
                    student.membershipPlan === '3classes' ? 22.99 : 29.99;
      
      await Payment.create({
        student: student._id,
        instructor: student.instructor,
        amount,
        dueDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
        membershipPlan: student.membershipPlan
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

    const overdueStudents = await Payment.find({
      status: 'pending',
      dueDate: { $lte: overduePeriod }
    }).populate('student');

    for (const payment of overdueStudents) {
      await User.findByIdAndUpdate(payment.student._id, { isBlocked: true });
      
      // Send email notification
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

// Routes
router.post('/', protect, authorize('instructor'), async (req, res) => {
  try {
    const payment = await Payment.create(req.body);
    res.status(201).json(payment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/student/:studentId', protect, async (req, res) => {
  try {
    const payments = await Payment.find({ student: req.params.studentId });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/pay', protect, authorize('student'), async (req, res) => {
  try {
    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'paid',
        paidDate: new Date()
      },
      { new: true }
    );
    res.json(payment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get instructor's students' payments
router.get('/instructor/:instructorId', protect, authorize('instructor'), async (req, res) => {
  try {
    const { status } = req.query;
    
    // First get all students of this instructor
    const students = await User.find({ 
      instructor: req.params.instructorId,
      role: 'student'
    });
    
    const studentIds = students.map(student => student._id);
    
    // Then get payments for these students
    const query = { 
      student: { $in: studentIds }
    };
    
    if (status && status !== 'all') {
      query.status = status;
    }

    const payments = await Payment.find(query)
      .populate('student', 'fullName email')
      .sort({ dueDate: -1 });

    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Send payment reminder
router.post('/send-reminder/:studentId', protect, authorize('instructor'), async (req, res) => {
  try {
    const student = await User.findById(req.params.studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const { subject, message } = req.body;

    await transporter.sendMail({
      to: student.email,
      subject,
      text: message
    });

    res.json({ message: 'Reminder sent successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router; 