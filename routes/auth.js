const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const crypto = require('crypto');
const cache = require('../cache');
const Payment = require('../models/Payment');

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, role, age, gender, instructor, membershipPlan } = req.body;

    if (await User.findOne({ email })) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const userData = {
      email,
      password,
      fullName,
      role,
      age,
      gender,
      membershipPlan: role === 'student' ? membershipPlan : undefined
    };

    if (role === 'student' && instructor) {
      userData.instructor = instructor;
    }

    const user = await User.create(userData);

    if (role === 'student') {
      // Create initial payment
      const amount = membershipPlan === '2classes' ? 14.99 :
                    membershipPlan === '3classes' ? 22.99 : 29.99;
      
      await Payment.create({
        student: user._id,
        amount,
        dueDate: new Date(),
        membershipPlan,
        status: 'pending'
      });

      if (instructor) {
        await User.findByIdAndUpdate(instructor, {
          $push: { students: user._id }
        });
      }
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: '30d'
    });

    res.status(201).json({ token });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      message: error.message || 'Error during registration',
      details: error.errors
    });
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: 'Account is blocked due to overdue payments' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: '30d'
    });

    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 */
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('instructor', 'fullName email')
      .populate('students', 'fullName email');

    // Add the full URL to the profile photo if it exists
    const userData = user.toObject();
    if (userData.profilePhoto) {
      userData.profilePhoto = `http://localhost:5000${userData.profilePhoto}`;
    }

    res.json(userData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Generate QR code for login
router.post('/qr-generate', async (req, res) => {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    // Store token in cache/db with expiration
    await cache.set(`qr-${token}`, '', 300); // 5 minutes expiration
    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Verify QR code login
router.post('/qr-verify', protect, async (req, res) => {
  try {
    const { token } = req.body;
    const isValid = await cache.get(`qr-${token}`);
    if (!isValid) {
      return res.status(400).json({ message: 'Invalid or expired QR code' });
    }
    
    const authToken = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, {
      expiresIn: '30d'
    });
    
    await cache.del(`qr-${token}`);
    res.json({ token: authToken });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add a new route to get all instructors
router.get('/instructors', async (req, res) => {
  try {
    const instructors = await User.find({ 
      role: 'instructor',
      isBlocked: false 
    }).select('_id fullName email');
    res.json(instructors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router; 