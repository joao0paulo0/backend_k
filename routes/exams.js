const express = require('express');
const router = express.Router();
const Exam = require('../models/Exam');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

router.post('/', protect, authorize('instructor'), async (req, res) => {
  try {
    // Validate required fields
    const { examName, examDate, maxRegistrants, targetBelt, eligibilityRequirements } = req.body;
    
    if (!examName || !examDate || !maxRegistrants || !targetBelt || !eligibilityRequirements) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Create the exam
    const exam = await Exam.create({
      examName,
      instructor: req.user._id,
      examDate,
      maxRegistrants,
      targetBelt,
      eligibilityRequirements,
      currentRegistrants: [],
      status: 'upcoming'
    });

    // Populate instructor details
    await exam.populate('instructor', 'fullName email');
    
    // Try to notify eligible students, but don't let email errors prevent exam creation
    try {
      const eligibleStudents = await User.find({
        role: 'student',
        beltLevel: eligibilityRequirements.minimumBelt,
        isBlocked: false
      });

      for (const student of eligibleStudents) {
        try {
          await transporter.sendMail({
            to: student.email,
            subject: 'New Exam Available',
            text: `A new exam "${examName}" for ${exam.targetBelt} belt is available on ${new Date(exam.examDate).toLocaleDateString()}.`
          });
        } catch (emailError) {
          console.error('Error sending email to student:', emailError);
          // Continue with next student even if one email fails
          continue;
        }
      }
    } catch (notificationError) {
      console.error('Error notifying students:', notificationError);
      // Continue with exam creation even if notifications fail
    }

    res.status(201).json(exam);
  } catch (error) {
    console.error('Error creating exam:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/', protect, async (req, res) => {
  try {
    const query = {};
    
    // Only apply filters if they are not 'all'
    if (req.query.belt && req.query.belt !== 'all') {
      query.targetBelt = req.query.belt;
    }
    if (req.query.status && req.query.status !== 'all') {
      query.status = req.query.status;
    }

    const exams = await Exam.find(query)
      .populate('instructor', 'fullName email')
      .populate('currentRegistrants', 'fullName email beltLevel')
      .sort({ createdAt: -1 }); // Sort by creation date, newest first
    
    res.json(exams);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/register', protect, authorize('student'), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    
    if (exam.currentRegistrants.length >= exam.maxRegistrants) {
      return res.status(400).json({ message: 'Exam is full' });
    }

    if (!exam.currentRegistrants.includes(req.user._id)) {
      exam.currentRegistrants.push(req.user._id);
      await exam.save();
    }

    res.json(exam);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update the exam results route
router.post('/:examId/results', protect, authorize('instructor'), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const { results } = req.body;
    
    // Process each result and update student belt level if passed
    for (const result of results) {
      if (result.passed) {
        const updatedStudent = await User.findByIdAndUpdate(
          result.student,
          { beltLevel: exam.targetBelt },
          { new: true }
        );

        if (updatedStudent) {
          // Send notification email
          try {
            await transporter.sendMail({
              to: updatedStudent.email,
              subject: 'Exam Results Available',
              text: `Your results for the ${exam.examName} are now available. Please log in to view your results.`
            });
          } catch (emailError) {
            console.error('Error sending result notification:', emailError);
          }
        }
      }
    }

    // Update exam status and results
    exam.status = 'completed';
    exam.results = results.map(result => ({
      ...result,
      gradedAt: new Date()
    }));
    await exam.save();

    res.json(exam);
  } catch (error) {
    console.error('Error recording exam results:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add this route to get registered exams
router.get('/registered/:studentId', protect, async (req, res) => {
  try {
    const exams = await Exam.find({
      currentRegistrants: req.params.studentId,
      status: { $in: ['upcoming', 'ongoing'] }
    })
    .populate('instructor', 'fullName email');
    
    res.json(exams);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add this route to update exam status
router.patch('/:examId/status', protect, authorize('instructor'), async (req, res) => {
  try {
    const { status } = req.body;
    const exam = await Exam.findById(req.params.examId);
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    if (exam.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this exam' });
    }

    exam.status = status;
    await exam.save();

    res.json(exam);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add this route to get a single exam
router.get('/:id', protect, async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('instructor', 'fullName email')
      .populate('currentRegistrants', 'fullName email beltLevel');
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    res.json(exam);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add this route for deleting exams
router.delete('/:examId', protect, authorize('instructor'), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    // Check if the instructor owns this exam
    if (exam.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this exam' });
    }

    // Only allow deletion of upcoming exams
    if (exam.status !== 'upcoming') {
      return res.status(400).json({ message: 'Can only delete upcoming exams' });
    }

    await exam.deleteOne();
    res.json({ message: 'Exam deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add this route to get student's exam results
router.get('/student/:studentId/results', protect, async (req, res) => {
  try {
    const exams = await Exam.find({
      'results.student': req.params.studentId,
      status: 'completed'
    })
    .populate('instructor', 'fullName email')
    .sort({ examDate: -1 });
    
    res.json(exams);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router; 