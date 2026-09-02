const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const ErrorResponse = require('../utils/errorResponse');

// ─── @desc  Get all employees
// ─── @route GET /api/v1/employees
// ─── @access Protected
exports.getEmployees = async (req, res, next) => {
  try {
    const filter = { shop: req.user._id };
    if (req.query.all !== 'true') filter.isActive = true;

    const employees = await Employee.find(filter).sort({ name: 1 });

    res.status(200).json({ success: true, count: employees.length, data: employees });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Get single employee
// ─── @route GET /api/v1/employees/:id
// ─── @access Protected
exports.getEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findOne({ _id: req.params.id, shop: req.user._id });

    if (!employee) return next(new ErrorResponse('Employee not found.', 404));

    res.status(200).json({ success: true, data: employee });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Add a new employee
// ─── @route POST /api/v1/employees
// ─── @access Protected
exports.createEmployee = async (req, res, next) => {
  try {
    req.body.shop = req.user._id;
    const employee = await Employee.create(req.body);

    res.status(201).json({ success: true, data: employee });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Update employee info
// ─── @route PUT /api/v1/employees/:id
// ─── @access Protected
exports.updateEmployee = async (req, res, next) => {
  try {
    delete req.body.shop;

    const employee = await Employee.findOneAndUpdate(
      { _id: req.params.id, shop: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!employee) return next(new ErrorResponse('Employee not found.', 404));

    res.status(200).json({ success: true, data: employee });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Soft-delete an employee
// ─── @route DELETE /api/v1/employees/:id
// ─── @access Protected
exports.deleteEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findOneAndUpdate(
      { _id: req.params.id, shop: req.user._id },
      { isActive: false },
      { new: true }
    );

    if (!employee) return next(new ErrorResponse('Employee not found.', 404));

    res.status(200).json({ success: true, message: 'Employee deactivated successfully.' });
  } catch (err) {
    next(err);
  }
};

// ═══════════════════════════════════════════════════════════
// ATTENDANCE
// ═══════════════════════════════════════════════════════════

// ─── @desc  Get attendance for a specific date
// ─── @route GET /api/v1/employees/attendance?date=YYYY-MM-DD
// ─── @access Protected
exports.getAttendanceByDate = async (req, res, next) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
    const start = new Date(dateStr); start.setHours(0, 0, 0, 0);
    const end   = new Date(dateStr); end.setHours(23, 59, 59, 999);

    const records = await Attendance.find({
      shop: req.user._id,
      date: { $gte: start, $lte: end },
    }).populate('employee', 'name role');

    res.status(200).json({ success: true, date: dateStr, count: records.length, data: records });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Get monthly attendance report for one employee
// ─── @route GET /api/v1/employees/:id/attendance?month=5&year=2024
// ─── @access Protected
exports.getMonthlyAttendance = async (req, res, next) => {
  try {
    const employee = await Employee.findOne({ _id: req.params.id, shop: req.user._id });
    if (!employee) return next(new ErrorResponse('Employee not found.', 404));

    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();

    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0, 23, 59, 59, 999);

    const records = await Attendance.find({
      shop: req.user._id,
      employee: req.params.id,
      date: { $gte: start, $lte: end },
    }).sort({ date: 1 });

    const summary = records.reduce(
      (acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; },
      { Present: 0, Absent: 0, 'Half-Day': 0, Leave: 0 }
    );

    res.status(200).json({
      success: true,
      employee: { id: employee._id, name: employee.name },
      month,
      year,
      summary,
      data: records,
    });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Mark attendance (single or bulk)
// ─── @route POST /api/v1/employees/attendance
// ─── @access Protected
exports.markAttendance = async (req, res, next) => {
  try {
    const entries = Array.isArray(req.body.records) ? req.body.records : [req.body];

    if (entries.length === 0) {
      return next(new ErrorResponse('No attendance records provided.', 400));
    }

    const ops = entries.map((entry) => {
      if (!entry.employee || !entry.date || !entry.status) {
        throw new ErrorResponse('Each attendance record requires employee, date, and status.', 400);
      }

      const normalizedDate = new Date(entry.date);
      normalizedDate.setHours(0, 0, 0, 0);

      return {
        updateOne: {
          filter: {
            shop: req.user._id,
            employee: entry.employee,
            date: normalizedDate,
          },
          update: {
            $set: { ...entry, shop: req.user._id, date: normalizedDate },
          },
          upsert: true,
        },
      };
    });

    await Attendance.bulkWrite(ops);

    res.status(200).json({ success: true, message: `${ops.length} attendance record(s) saved.` });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Update a single attendance record
// ─── @route PUT /api/v1/employees/attendance/:id
// ─── @access Protected
exports.updateAttendance = async (req, res, next) => {
  try {
    const record = await Attendance.findOneAndUpdate(
      { _id: req.params.id, shop: req.user._id },
      { status: req.body.status, notes: req.body.notes },
      { new: true, runValidators: true }
    );

    if (!record) return next(new ErrorResponse('Attendance record not found.', 404));

    res.status(200).json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
};
