const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config();

const createAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        // Check if admin exists
        const adminExists = await User.findOne({ email: 'admin@example.com' });

        if (adminExists) {
            console.log('Admin user already exists');
            process.exit();
        }

        // Create Admin User
        const user = await User.create({
            name: 'Admin User',
            email: 'admin@example.com',
            password: 'password123', // Model hook will hash this
            role: 'admin',
            profilePhoto: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
        });

        console.log('Admin User Create Successfully!');
        console.log('Email: admin@example.com');
        console.log('Password: password123');

        process.exit();
    } catch (error) {
        console.error(`${error}`);
        process.exit(1);
    }
};

createAdmin();
