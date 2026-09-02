const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Employee name is required'],
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      default: 'Staff', // e.g. Cashier, Helper, Manager, Stock Boy
      trim: true,
    },
    salary: {
      type: Number,
      default: 0,
      min: [0, 'Salary cannot be negative'],
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Employee', EmployeeSchema);
