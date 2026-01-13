const mongoose = require('mongoose');

const permissionSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        required: true
    },
    module: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Permission', permissionSchema);
