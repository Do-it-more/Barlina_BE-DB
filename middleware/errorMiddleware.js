const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
};

const errorHandler = (err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

    // Log basic error info
    console.error(`[ERROR] ${statusCode} ${req.method} ${req.originalUrl} - ${err.message}`);

    // Only log stack trace for server errors (500+)
    if (statusCode >= 500) {
        console.error('[ERROR STACK]', err.stack);
    }

    res.status(statusCode);
    res.json({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};

module.exports = { notFound, errorHandler };
