const mongoose = require('mongoose');
require('dotenv').config();

const Product = require('../models/Product');
const User = require('../models/User');

const products = [
    // ===== ELECTRONICS =====
    {
        name: 'Wireless Bluetooth Earbuds Pro',
        image: 'https://images.unsplash.com/photo-1590658268037-6bf12f032f55?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1590658268037-6bf12f032f55?w=600&q=80',
            'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=600&q=80'
        ],
        brand: 'SoundMax',
        category: 'Electronics',
        description: 'Premium wireless earbuds with active noise cancellation, 30-hour battery life, and crystal-clear sound quality. IPX5 water resistant with touch controls.',
        price: 2999,
        discountPrice: 1999,
        countInStock: 50,
        colors: ['Black', 'White', 'Navy Blue'],
        specifications: [{ heading: 'Audio', items: [{ key: 'Driver Size', value: '13mm' }, { key: 'Battery Life', value: '30 hours' }, { key: 'Noise Cancellation', value: 'Active ANC' }] }]
    },
    {
        name: 'Smart Watch Ultra Fitness Tracker',
        image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80',
            'https://images.unsplash.com/photo-1546868871-af0de0ae72be?w=600&q=80'
        ],
        brand: 'FitTech',
        category: 'Electronics',
        description: 'Advanced smartwatch with AMOLED display, heart rate monitoring, SpO2 sensor, GPS tracking, and 14-day battery life. Perfect for fitness enthusiasts.',
        price: 4999,
        discountPrice: 3499,
        countInStock: 35,
        colors: ['Midnight Black', 'Silver', 'Rose Gold'],
        specifications: [{ heading: 'Display', items: [{ key: 'Screen', value: '1.43" AMOLED' }, { key: 'Battery', value: '14 days' }, { key: 'Water Resistance', value: '5ATM' }] }]
    },
    {
        name: 'Portable Bluetooth Speaker 20W',
        image: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&q=80'
        ],
        brand: 'BassWave',
        category: 'Electronics',
        description: 'Powerful 20W portable Bluetooth speaker with deep bass, 360° surround sound, IPX7 waterproof rating, and 12-hour playtime. Built-in microphone for calls.',
        price: 3499,
        discountPrice: 2499,
        countInStock: 40,
        colors: ['Black', 'Red', 'Blue'],
        specifications: [{ heading: 'Audio', items: [{ key: 'Output', value: '20W' }, { key: 'Battery', value: '12 hours' }, { key: 'Waterproof', value: 'IPX7' }] }]
    },
    {
        name: 'USB-C Fast Charging Power Bank 20000mAh',
        image: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600&q=80'
        ],
        brand: 'ChargePro',
        category: 'Electronics',
        description: 'Ultra-slim 20000mAh power bank with 65W USB-C fast charging, dual USB ports, LED display, and airline-safe design. Charge your laptop and phone simultaneously.',
        price: 2499,
        discountPrice: 1799,
        countInStock: 60,
        colors: ['Black', 'White'],
        specifications: [{ heading: 'Specs', items: [{ key: 'Capacity', value: '20000mAh' }, { key: 'Output', value: '65W USB-C' }, { key: 'Ports', value: '3 (2 USB-A + 1 USB-C)' }] }]
    },
    {
        name: 'Mechanical Gaming Keyboard RGB',
        image: 'https://images.unsplash.com/photo-1595225476474-87563907a212?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1595225476474-87563907a212?w=600&q=80'
        ],
        brand: 'KeyForce',
        category: 'Electronics',
        description: 'Full-size mechanical keyboard with Cherry MX Blue switches, per-key RGB backlighting, programmable macros, detachable wrist rest, and braided USB-C cable.',
        price: 5999,
        discountPrice: 4299,
        countInStock: 25,
        colors: ['Black', 'White'],
        specifications: [{ heading: 'Features', items: [{ key: 'Switch Type', value: 'Cherry MX Blue' }, { key: 'Backlight', value: 'Per-key RGB' }, { key: 'Connection', value: 'USB-C' }] }]
    },
    {
        name: 'Wireless Mouse Ergonomic Silent',
        image: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=600&q=80'
        ],
        brand: 'ErgoClick',
        category: 'Electronics',
        description: 'Ergonomic wireless mouse with silent clicks, 4000 DPI sensor, 6 programmable buttons, dual-mode Bluetooth/2.4GHz, and 90-day battery life.',
        price: 1299,
        discountPrice: 899,
        countInStock: 80,
        colors: ['Black', 'Grey', 'White'],
        specifications: [{ heading: 'Specs', items: [{ key: 'DPI', value: '4000' }, { key: 'Battery', value: '90 days' }, { key: 'Connectivity', value: 'Bluetooth + 2.4GHz' }] }]
    },
    {
        name: 'HD Webcam 1080p with Ring Light',
        image: 'https://images.unsplash.com/photo-1612336307429-8a898d10e223?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1612336307429-8a898d10e223?w=600&q=80'
        ],
        brand: 'ClearView',
        category: 'Electronics',
        description: 'Full HD 1080p webcam with built-in ring light, auto-focus, noise-canceling dual microphones, and privacy cover. Perfect for video calls and streaming.',
        price: 2999,
        discountPrice: 1999,
        countInStock: 30,
        colors: ['Black'],
        specifications: [{ heading: 'Camera', items: [{ key: 'Resolution', value: '1080p Full HD' }, { key: 'FPS', value: '30fps' }, { key: 'Microphone', value: 'Dual noise-canceling' }] }]
    },
    {
        name: 'Laptop Stand Adjustable Aluminum',
        image: 'https://images.unsplash.com/photo-1616353110472-7c17dd699063?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1616353110472-7c17dd699063?w=600&q=80'
        ],
        brand: 'DeskPro',
        category: 'Electronics',
        description: 'Premium aluminum laptop stand with 6 adjustable height levels, heat dissipation design, anti-slip silicone pads, and foldable portable design. Fits 10"-17" laptops.',
        price: 1999,
        discountPrice: 1299,
        countInStock: 45,
        colors: ['Silver', 'Space Grey'],
        specifications: [{ heading: 'Design', items: [{ key: 'Material', value: 'Aluminum Alloy' }, { key: 'Compatibility', value: '10" - 17" laptops' }, { key: 'Weight', value: '280g' }] }]
    },

    // ===== FASHION =====
    {
        name: 'Classic Cotton Polo T-Shirt',
        image: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=600&q=80',
            'https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?w=600&q=80'
        ],
        brand: 'UrbanStyle',
        category: 'Fashion design',
        description: 'Premium 100% cotton polo t-shirt with breathable fabric, ribbed collar, classic fit, and embroidered logo. Perfect for casual and semi-formal occasions.',
        price: 1299,
        discountPrice: 799,
        countInStock: 100,
        colors: ['White', 'Black', 'Navy Blue', 'Olive Green', 'Maroon'],
        specifications: [{ heading: 'Details', items: [{ key: 'Material', value: '100% Cotton' }, { key: 'Fit', value: 'Classic Fit' }, { key: 'Wash', value: 'Machine Washable' }] }]
    },
    {
        name: 'Slim Fit Denim Jeans',
        image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1542272604-787c3835535d?w=600&q=80',
            'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=600&q=80'
        ],
        brand: 'DenimCraft',
        category: 'Fashion design',
        description: 'Modern slim-fit denim jeans crafted from premium stretch denim. Features 5-pocket styling, zip fly closure, and a comfortable mid-rise waist.',
        price: 2499,
        discountPrice: 1699,
        countInStock: 70,
        colors: ['Dark Blue', 'Light Blue', 'Black', 'Grey'],
        specifications: [{ heading: 'Details', items: [{ key: 'Material', value: 'Stretch Denim' }, { key: 'Fit', value: 'Slim Fit' }, { key: 'Rise', value: 'Mid Rise' }] }]
    },
    {
        name: 'Leather Crossbody Bag',
        image: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&q=80'
        ],
        brand: 'LuxeLeather',
        category: 'Fashion design',
        description: 'Handcrafted genuine leather crossbody bag with adjustable strap, multiple compartments, magnetic closure, and antique brass hardware. Elegant and functional.',
        price: 3999,
        discountPrice: 2799,
        countInStock: 25,
        colors: ['Tan', 'Black', 'Dark Brown'],
        specifications: [{ heading: 'Details', items: [{ key: 'Material', value: 'Genuine Leather' }, { key: 'Dimensions', value: '25cm x 18cm x 8cm' }, { key: 'Closure', value: 'Magnetic Snap' }] }]
    },
    {
        name: 'Running Sports Shoes Ultralight',
        image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80',
            'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&q=80'
        ],
        brand: 'RunElite',
        category: 'Fashion design',
        description: 'Ultra-lightweight running shoes with responsive cushioning, breathable mesh upper, non-slip rubber outsole, and memory foam insole for all-day comfort.',
        price: 3499,
        discountPrice: 2299,
        countInStock: 55,
        colors: ['Black/Red', 'White/Blue', 'Grey/Orange', 'Navy/White'],
        specifications: [{ heading: 'Details', items: [{ key: 'Upper', value: 'Breathable Mesh' }, { key: 'Sole', value: 'Rubber Non-slip' }, { key: 'Weight', value: '220g per shoe' }] }]
    },
    {
        name: 'Aviator Sunglasses UV400',
        image: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=600&q=80'
        ],
        brand: 'ShadesCo',
        category: 'Fashion design',
        description: 'Classic aviator sunglasses with UV400 protection, polarized lenses, lightweight metal frame, and adjustable nose pads. Comes with a premium hard case.',
        price: 1999,
        discountPrice: 1299,
        countInStock: 90,
        colors: ['Gold/Green', 'Silver/Blue', 'Black/Grey'],
        specifications: [{ heading: 'Lens', items: [{ key: 'Protection', value: 'UV400' }, { key: 'Lens Type', value: 'Polarized' }, { key: 'Frame', value: 'Metal Alloy' }] }]
    },
    {
        name: 'Formal Slim Fit Shirt',
        image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&q=80',
            'https://images.unsplash.com/photo-1598032895397-b9472444bf93?w=600&q=80'
        ],
        brand: 'FormalEdge',
        category: 'Fashion design',
        description: 'Premium cotton-blend formal shirt with slim fit, spread collar, button cuffs, and wrinkle-resistant finish. Ideal for office wear and formal events.',
        price: 1799,
        discountPrice: 1199,
        countInStock: 65,
        colors: ['White', 'Light Blue', 'Pink', 'Lavender'],
        specifications: [{ heading: 'Details', items: [{ key: 'Material', value: 'Cotton Blend' }, { key: 'Fit', value: 'Slim Fit' }, { key: 'Care', value: 'Machine Wash / Iron Safe' }] }]
    },
    {
        name: 'Canvas Tote Bag Large',
        image: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1544816155-12df9643f363?w=600&q=80'
        ],
        brand: 'EcoCarry',
        category: 'Fashion design',
        description: 'Spacious canvas tote bag with reinforced handles, inner zip pocket, magnetic closure, and sturdy base. Eco-friendly and perfect for everyday use.',
        price: 999,
        discountPrice: 699,
        countInStock: 120,
        colors: ['Natural', 'Black', 'Navy', 'Olive'],
        specifications: [{ heading: 'Details', items: [{ key: 'Material', value: 'Heavy-duty Canvas' }, { key: 'Dimensions', value: '40cm x 35cm x 12cm' }, { key: 'Closure', value: 'Magnetic Snap' }] }]
    },
    {
        name: 'Analog Leather Watch Classic',
        image: 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=600&q=80',
            'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?w=600&q=80'
        ],
        brand: 'TimeKeeper',
        category: 'Fashion design',
        description: 'Elegant analog watch with genuine leather strap, sapphire crystal glass, Japanese quartz movement, and 3ATM water resistance. A timeless accessory.',
        price: 4999,
        discountPrice: 3499,
        countInStock: 20,
        colors: ['Brown/Gold', 'Black/Silver', 'Tan/Rose Gold'],
        specifications: [{ heading: 'Watch', items: [{ key: 'Movement', value: 'Japanese Quartz' }, { key: 'Glass', value: 'Sapphire Crystal' }, { key: 'Water Resistance', value: '3ATM' }] }]
    },
    {
        name: 'Winter Jacket Waterproof Windbreaker',
        image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600&q=80'
        ],
        brand: 'StormShield',
        category: 'Fashion design',
        description: 'Lightweight waterproof windbreaker jacket with sealed seams, adjustable hood, zippered pockets, and breathable lining. Perfect for outdoor adventures and rainy days.',
        price: 3999,
        discountPrice: 2799,
        countInStock: 30,
        colors: ['Black', 'Navy', 'Olive Green', 'Burgundy'],
        specifications: [{ heading: 'Details', items: [{ key: 'Material', value: 'Waterproof Nylon' }, { key: 'Features', value: 'Sealed seams, Adjustable hood' }, { key: 'Weight', value: '350g' }] }]
    },
    {
        name: 'Cotton Crew Socks Pack of 6',
        image: 'https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?w=600&q=80'
        ],
        brand: 'ComfortStep',
        category: 'Fashion design',
        description: 'Premium cotton crew socks pack of 6 with cushioned sole, arch support, moisture-wicking fabric, and reinforced heel and toe. Available in assorted colors.',
        price: 599,
        discountPrice: 399,
        countInStock: 200,
        colors: ['Assorted'],
        specifications: [{ heading: 'Details', items: [{ key: 'Material', value: '80% Cotton, 20% Elastane' }, { key: 'Pack', value: '6 pairs' }, { key: 'Length', value: 'Crew Length' }] }]
    },
    {
        name: 'Wireless Charging Pad 15W',
        image: 'https://images.unsplash.com/photo-1622445275463-afa2ab738c34?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1622445275463-afa2ab738c34?w=600&q=80'
        ],
        brand: 'ChargePro',
        category: 'Electronics',
        description: 'Ultra-thin 15W wireless charging pad with LED indicator, anti-slip surface, foreign object detection, and temperature protection. Compatible with all Qi-enabled devices.',
        price: 999,
        discountPrice: 699,
        countInStock: 75,
        colors: ['Black', 'White'],
        specifications: [{ heading: 'Specs', items: [{ key: 'Power', value: '15W Max' }, { key: 'Standard', value: 'Qi Certified' }, { key: 'Safety', value: 'Over-temp & FOD protection' }] }]
    },
    {
        name: 'Noise Cancelling Over-Ear Headphones',
        image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80',
        images: [
            'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80',
            'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=600&q=80'
        ],
        brand: 'SoundMax',
        category: 'Electronics',
        description: 'Premium over-ear headphones with hybrid active noise cancellation, Hi-Res audio, 40-hour battery, memory foam ear cushions, and foldable design with carrying case.',
        price: 7999,
        discountPrice: 5499,
        countInStock: 20,
        colors: ['Matte Black', 'Cream White', 'Midnight Blue'],
        specifications: [{ heading: 'Audio', items: [{ key: 'Driver', value: '40mm Custom' }, { key: 'ANC', value: 'Hybrid Active' }, { key: 'Battery', value: '40 hours' }] }]
    }
];

async function seedProducts() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Find admin user
        const admin = await User.findOne({ role: { $in: ['super_admin', 'admin'] } });
        if (!admin) {
            console.error('No admin user found! Please create one first.');
            process.exit(1);
        }

        console.log(`Using admin: ${admin.name} (${admin._id})`);

        // Add user reference and defaults to each product
        const productsToInsert = products.map(p => ({
            ...p,
            user: admin._id,
            ownerType: 'PLATFORM',
            listingStatus: 'APPROVED',
            isLive: true,
            isCodAvailable: true,
            returnPolicy: {
                isReturnable: true,
                returnWindowDays: 7,
                returnType: 'BOTH'
            }
        }));

        const result = await Product.insertMany(productsToInsert);
        console.log(`✅ Successfully added ${result.length} products!`);

        // Show summary
        const electronics = result.filter(p => p.category === 'Electronics');
        const fashion = result.filter(p => p.category === 'Fashion design');
        console.log(`   📱 Electronics: ${electronics.length}`);
        console.log(`   👗 Fashion: ${fashion.length}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error seeding products:', error.message);
        process.exit(1);
    }
}

seedProducts();
