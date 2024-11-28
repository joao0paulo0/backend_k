const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  examName: {
    type: String,
    required: true
  },
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  examDate: {
    type: Date,
    required: true
  },
  maxRegistrants: {
    type: Number,
    required: true
  },
  currentRegistrants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  targetBelt: {
    type: String,
    enum: ['yellow', 'orange', 'green', 'blue', 'brown', 'black'],
    required: true
  },
  eligibilityRequirements: {
    minimumBelt: {
      type: String,
      enum: ['white', 'yellow', 'orange', 'green', 'blue', 'brown'],
      required: true
    },
    minimumTrainingMonths: {
      type: Number,
      required: true
    }
  },
  status: {
    type: String,
    enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
    default: 'upcoming'
  },
  results: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    passed: Boolean,
    notes: String,
    gradedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Exam', examSchema); 