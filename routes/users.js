const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

// Get instructor's students
router.get('/instructor/:instructorId/students', protect, authorize('instructor'), async (req, res) => {
  try {
    const students = await User.find({
      instructor: req.params.instructorId,
      role: 'student'
    }).select('-password');
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Block/Unblock student
router.patch('/:studentId/block', protect, authorize('instructor'), async (req, res) => {
  try {
    const student = await User.findById(req.params.studentId);
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (student.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to manage this student' });
    }

    student.isBlocked = !student.isBlocked;
    await student.save();

    res.json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update user profile
router.patch('/profile', protect, async (req, res) => {
  try {
    const updates = req.body;
    delete updates.password;
    delete updates.role;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    ).select('-password');

    // Add full URL to profile photo
    const userData = user.toObject();
    if (userData.profilePhoto) {
      userData.profilePhoto = `http://localhost:5000${userData.profilePhoto}`;
    }

    res.json(userData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update student's belt level
router.patch('/:studentId/belt', protect, authorize('instructor'), async (req, res) => {
  try {
    const { beltLevel } = req.body;
    const student = await User.findById(req.params.studentId);
    
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (student.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this student' });
    }

    student.beltLevel = beltLevel;
    await student.save();

    // Send congratulatory email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      to: student.email,
      subject: 'Congratulations on Your Belt Promotion!',
      text: `Congratulations! You have been promoted to ${beltLevel} belt.`
    });

    res.json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add this route to handle password changes
router.patch('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update the profile photo route
router.post('/profile-photo', protect, async (req, res) => {
  try {
    if (!req.files || !req.files.profilePhoto) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const file = req.files.profilePhoto;
    
    // Validate file type
    if (!file.mimetype.startsWith('image/')) {
      return res.status(400).json({ message: 'Please upload an image file' });
    }

    // Create unique filename
    const fileName = `${Date.now()}-${file.name}`;
    const uploadPath = path.join(__dirname, '../uploads', fileName);

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Move file to uploads directory
    await file.mv(uploadPath);

    // Update user profile with new photo URL
    const photoUrl = `/uploads/${fileName}`;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profilePhoto: photoUrl },
      { new: true }
    ).select('-password');

    // Convert user to object and add full URL
    const userData = user.toObject();
    const fullPhotoUrl = `http://localhost:5000${photoUrl}`;
    userData.profilePhoto = fullPhotoUrl;

    res.json({ 
      message: 'Profile photo updated successfully',
      profilePhoto: fullPhotoUrl,
      user: userData
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ message: 'Error uploading file: ' + error.message });
  }
});

// Add this route to your existing routes
router.post('/send-email/:userId', protect, async (req, res) => {
  try {
    const { subject, message } = req.body;
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Send email using nodemailer
    const transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: subject,
      text: message
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Detailed email error:', {
      message: error.message,
      stack: error.stack,
      response: error.response
    });
    res.status(500).json({ 
      success: false, 
      message: 'Error sending email',
      error: error.message 
    });
  }
});

module.exports = router; 