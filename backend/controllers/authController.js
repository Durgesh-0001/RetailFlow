const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');

// Helper to generate JWT and return response
const sendTokenResponse = (user, statusCode, res) => {
  const token = user.getSignedJwt();

  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      shopName: user.shopName,
      ownerName: user.ownerName,
      email: user.email,
      phone: user.phone,
      address: user.address,
      currency: user.currency,
      currencySymbol: user.currencySymbol,
    },
  });
};

// ─── @desc Register a new shop owner
// ─── @route POST /api/v1/auth/register
// ─── @access Public
exports.register = async (req, res, next) => {
  try {
    const { shopName, ownerName, email, password, phone, address } = req.body;

    const user = await User.create({
      shopName,
      ownerName,
      email,
      password,
      phone,
      address,
    });

    sendTokenResponse(user, 201, res);
  } catch (err) {
    next(err);
  }
};

// ─── @desc Login shop owner
// ─── @route POST /api/v1/auth/login
// ─── @access Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new ErrorResponse('Please provide an email and password.', 400));
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return next(new ErrorResponse('Invalid credentials.', 401));
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return next(new ErrorResponse('Invalid credentials.', 401));
    }

    sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// ─── @desc Get logged-in shop owner profile
// ─── @route GET /api/v1/auth/me
// ─── @access Protected
exports.getMe = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (err) {
    next(err);
  }
};

// ─── @desc Update shop owner profile / shop settings
// ─── @route PUT /api/v1/auth/me
// ─── @access Protected
exports.updateMe = async (req, res, next) => {
  try {
    const allowedFields = ['shopName', 'ownerName', 'phone', 'address', 'currency', 'currencySymbol'];
    const updateData = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const user = await User.findByIdAndUpdate(req.user._id, updateData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      user,
    });
  } catch (err) {
    next(err);
  }
};
