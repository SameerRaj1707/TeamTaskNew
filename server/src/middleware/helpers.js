const { ZodError } = require('zod');
const mongoose = require('mongoose');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Validate req.body (or another source) with a zod schema and replace it with the parsed value.
const validate =
  (schema, source = 'body') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(result.error);
    req[source] = result.data;
    next();
  };

const validateObjectId = (param) => (req, _res, next) => {
  if (!mongoose.isValidObjectId(req.params[param])) return next(new HttpError(400, 'Invalid id'));
  next();
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });
  if (err && err.code === 11000) return res.status(409).json({ message: 'Already exists' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ message: 'Payload too large' });
  console.error(err);
  res.status(500).json({ message: 'Something went wrong' }); // never leak internals
}

const notFound = (_req, res) => res.status(404).json({ message: 'Not found' });

module.exports = { HttpError, asyncHandler, validate, validateObjectId, errorHandler, notFound };
