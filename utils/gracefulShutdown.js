/**
 * Graceful Shutdown Handler
 * Ensures in-flight requests complete, connections close cleanly,
 * and resources are freed before the process exits.
 * Critical for zero-downtime deployments with PM2 cluster mode.
 */

const mongoose = require('mongoose');

let server = null;
let ioInstance = null;
let isShuttingDown = false;

const registerServer = (httpServer, io) => {
    server = httpServer;
    ioInstance = io;
};

const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n[Shutdown] Received ${signal}. Starting graceful shutdown...`);

    // 1. Stop accepting new connections
    if (server) {
        server.close(() => {
            console.log('[Shutdown] HTTP server closed — no new connections');
        });
    }

    // 2. Close WebSocket connections
    if (ioInstance) {
        ioInstance.close(() => {
            console.log('[Shutdown] Socket.io closed');
        });
    }

    // 3. Close cache service
    try {
        const cache = require('../services/cacheService');
        await cache.close();
    } catch (err) {
        // Ignore if cache not initialized
    }

    // 4. Close job queues
    try {
        const { closeQueues } = require('../services/queueService');
        await closeQueues();
    } catch (err) {
        // Ignore if queues not initialized
    }

    // 5. Close database connection
    try {
        await mongoose.connection.close();
        console.log('[Shutdown] MongoDB connection closed');
    } catch (err) {
        console.error('[Shutdown] Error closing MongoDB:', err.message);
    }

    // 6. Final exit
    console.log('[Shutdown] Graceful shutdown complete. Goodbye! 👋');

    // If running under PM2, signal ready for restart
    if (process.send) {
        process.send('ready');
    }

    process.exit(0);
};

const init = () => {
    // Handle termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle PM2 graceful reload
    process.on('message', (msg) => {
        if (msg === 'shutdown') {
            shutdown('PM2_SHUTDOWN');
        }
    });

    // Handle uncaught exceptions (log and restart)
    process.on('uncaughtException', (error) => {
        console.error('[FATAL] Uncaught Exception:', error);
        shutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
        // Don't shutdown on unhandled rejection, just log
    });
};

module.exports = { init, registerServer, shutdown };
