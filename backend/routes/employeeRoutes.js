const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const cacheMiddleware = require('../middleware/cache');
const {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getAttendanceByDate,
  getMonthlyAttendance,
  markAttendance,
  updateAttendance,
} = require('../controllers/employeeController');

router.use(protect);

// Attendance routes
router.route('/attendance').get(cacheMiddleware(30), getAttendanceByDate).post(markAttendance);
router.route('/attendance/:id').put(updateAttendance);
router.route('/:id/attendance').get(cacheMiddleware(60), getMonthlyAttendance);

// Employee CRUD routes
router.route('/').get(cacheMiddleware(60), getEmployees).post(createEmployee);
router.route('/:id').get(cacheMiddleware(60), getEmployee).put(updateEmployee).delete(deleteEmployee);

module.exports = router;
