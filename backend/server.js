require('dotenv').config();
const express = require("express");
const cors = require("cors");

const uploadRoute = require("./routes/upload");
const queryRoute = require("./routes/query");
const datasetsRoute = require("./routes/datasets");

const authRoute = require("./routes/auth");
const historyRoute = require("./routes/history");
const projectsRoute = require("./routes/projects");
const sessionsRoute = require("./routes/sessions");
const qualityRoute = require("./routes/quality");
const connectMongo = require("./services/mongoService");

const app = express();

// Connect to MongoDB
connectMongo();

app.use(cors({
    origin: ['http://localhost:5173', 'https://data-intel.vercel.app'],
    credentials: true
}));
app.use(express.json());

app.use("/auth", authRoute);
app.use("/upload", uploadRoute);
app.use("/ask", queryRoute);
app.use("/datasets", datasetsRoute);
app.use("/history", historyRoute);
app.use("/projects", projectsRoute);
app.use("/sessions", sessionsRoute);
app.use("/quality", qualityRoute);

const PORT = process.env.PORT || 5000;

// Keep-alive ping for Render
const cron = require('node-cron');
const axios = require('axios');

app.get("/ping", (req, res) => res.json({ status: "alive" }));

cron.schedule('*/14 * * * *', async () => {
    try {
        const selfUrl = process.env.SELF_URL || `http://localhost:${PORT}`;
        await axios.get(`${selfUrl}/ping`);
        console.log('Backend Ping Success');
    } catch (err) {
        console.error('Backend Ping Failed', err.message);
    }
});

app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
});