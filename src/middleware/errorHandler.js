function errorHandler(err, req, res, next) {
    console.error('❌ Error:', err.message);
    const status = err.status || 500;
    res.status(status).json({
        error: err.code || 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred'
    });
}

function createError(status, code, message) {
    const err = new Error(message);
    err.status = status;
    err.code = code;
    return err;
}

module.exports = { errorHandler, createError };
