const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Product = require('./models/Product');
const User = require('./models/User');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const products = [
    {
        name: "Premium Wireless Headphones",
        category: "headphones",
        price: 299,
        brand: "SoundCore",
        rating: 4.8,
        numReviews: 124,
        countInStock: 10,
        image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        description: "Experience high-fidelity sound with our premium wireless headphones. Featuring active noise cancellation and 30-hour battery life."
    },
    {
        name: "Smart Fitness Watch",
        category: "smartwatch",
        price: 159,
        brand: "FitTech",
        rating: 4.9,
        numReviews: 89,
        countInStock: 20,
        image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        description: "Track your fitness goals with precision. Monitors heart rate, sleep, and steps. Waterproof up to 50m."
    },
    {
        name: "Ultra Slim Laptop Pro",
        category: "laptops",
        price: 1299,
        brand: "TechPro",
        rating: 4.7,
        numReviews: 230,
        countInStock: 5,
        image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        description: "Power meets portability. The Ultra Slim Laptop Pro features the latest M2 chip and a stunning Retina display."
    },
    {
        name: "Designer Denim Jacket",
        category: "clothing",
        price: 89,
        brand: "DenimCo",
        rating: 4.5,
        numReviews: 56,
        countInStock: 15,
        image: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        description: "Classic style for the modern wardrobe. Made from high-quality denim with a comfortable fit."
    },
    {
        name: "Professional Camera Kit",
        category: "electronics",
        price: 850,
        brand: "Canon",
        rating: 4.9,
        numReviews: 45,
        countInStock: 3,
        image: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        description: "Capture every moment in stunning detail. Includes DSLR body, 18-55mm lens, and carrying case."
    },
    {
        name: "Minimalist Sneaker",
        category: "footwear",
        price: 120,
        brand: "StepComfort",
        rating: 4.6,
        numReviews: 112,
        countInStock: 25,
        image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        description: "Comfort meets style. These minimalist sneakers are perfect for everyday wear."
    },
    {
        name: "Smart Home Speaker",
        category: "electronics",
        price: 79,
        brand: "EchoSound",
        rating: 4.4,
        numReviews: 34,
        countInStock: 100,
        image: "https://images.unsplash.com/photo-1589492477829-5e65395b66cc?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        description: "Voice-controlled smart speaker with premium sound quality. Compatible with all major smart home platforms."
    },
    {
        name: "Classic Leather Watch",
        category: "accessories",
        price: 250,
        brand: "Timeless",
        rating: 4.8,
        numReviews: 67,
        countInStock: 12,
        image: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        description: "Timeless elegance. Genuine leather strap and sapphire crystal glass."
    }
];

const importData = async () => {
    try {
        await Product.deleteMany();
        // await User.deleteMany(); // Don't delete users to preserve your login

        // Check for existing user
        let adminUser = await User.findOne();

        // Create Admin User if none exists
        if (!adminUser) {
            adminUser = await User.create({
                name: 'Admin User',
                email: 'admin@example.com',
                password: 'password123', // Will be hashed by model
                role: 'admin'
            });
        }

        const adminUserId = adminUser._id;

        const sampleProducts = products.map(product => {
            return { ...product, user: adminUserId };
        });

        await Product.insertMany(sampleProducts);

        console.log('Data Imported!');
        process.exit();
    } catch (error) {
        console.error(`${error}`);
        process.exit(1);
    }
};

importData();
