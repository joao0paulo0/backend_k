require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Payment = require('../models/Payment');

async function generateMonthlyFees() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const students = await User.find({ role: 'student', isBlocked: false });
    
    for (const student of students) {
      const amount = student.membershipPlan === '2classes' ? 14.99 :
                    student.membershipPlan === '3classes' ? 22.99 : 29.99;
      
      await Payment.create({
        student: student._id,
        amount,
        dueDate: new Date(),
        membershipPlan: student.membershipPlan,
        status: 'pending'
      });

      console.log(`Generated payment for student: ${student.fullName}`);
    }

    console.log('Monthly fees generated successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error generating monthly fees:', error);
    process.exit(1);
  }
}

generateMonthlyFees(); 