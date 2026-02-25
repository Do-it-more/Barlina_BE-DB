/**
 * Lightweight Test Setup File
 * Uses mocking instead of MongoDB Memory Server for faster, more reliable tests
 */

const mongoose = require('mongoose');

// Increase timeout for tests
jest.setTimeout(30000);

// Mock environment variables for testing
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

// Mock mongoose connection for unit tests
beforeAll(async () => {
    // Tests will use actual MongoDB connection from .env if available
    // Otherwise, individual tests should mock the database operations
});

afterAll(async () => {
    // Clean up any connections
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
});
