const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['Present', 'Absent', 'Half-Day', 'Leave'],
      required: true,
      default: 'Present',
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// Compound index: one attendance record per employee per day
AttendanceSchema.index({ shop: 1, employee: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', AttendanceSchema);
