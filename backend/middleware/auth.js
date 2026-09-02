const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');

/**
 * protect — Verifies JWT and attaches current authenticated shop owner to req.user
 */
exports.protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new ErrorResponse('Not authorized. No token provided.', 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);

    if (!req.user) {
      return next(new ErrorResponse('User belonging to this token no longer exists.', 401));
    }

    next();
  } catch (err) {
    return next(new ErrorResponse('Not authorized. Token is invalid or expired.', 401));
  }
};
