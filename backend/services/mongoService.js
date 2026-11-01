const mongoose = require('mongoose');

const connectMongo = async () => {
    try {
        const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/dataintel_chat';
        await mongoose.connect(uri);
        console.log("Connected to MongoDB for Chat History");
    } catch (err) {
        console.error("Failed to connect to MongoDB:", err.message);
        console.error("Please configure a valid MONGO_URI in backend/.env (e.g., MongoDB Atlas or local MongoDB).");
        process.exit(1);
    }
};

module.exports = connectMongo;
