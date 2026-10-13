const express = require("express");
const pool = require("../services/mysqlService");
const validateSQL = require("../middleware/sqlValidator");
const { generateSQL, generateExplanation } = require("../services/aiService");
const authMiddleware = require("../middleware/authMiddleware");
const ChatHistory = require("../models/ChatHistory");

const router = express.Router();

router.post("/", authMiddleware, async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const { datasetId, question, sessionId } = req.body;

        if (!datasetId || !question || !sessionId) {
            console.warn("Missing required fields:", { datasetId, question, sessionId });
            return res.status(400).json({
                error: "datasetId, question, and sessionId are required."
            });
        }

        console.log("Question:", question);

        /* ==============================
           1️⃣ Fetch Table Name
        ============================== */

        const datasetIdNum = parseInt(datasetId, 10);

        const [datasetRows] = await connection.query(
            "SELECT table_name FROM datasets WHERE id = ?",
            [datasetIdNum]
        );

        if (datasetRows.length === 0) {
            return res.status(400).json({
                error: "Invalid dataset ID"
            });
        }

        const tableName = datasetRows[0].table_name;

        /* ==============================
           2️⃣ Fetch Full Schema (with samples)
        ============================== */

        const [schemaRows] = await connection.query(
            "SELECT column_name, data_type, sample_values FROM dataset_schema WHERE dataset_id = ?",
            [datasetIdNum]
        );

        if (schemaRows.length === 0) {
            return res.status(400).json({
                error: "Schema not found for dataset"
            });
        }

        const allowedColumns = schemaRows.map(r => r.column_name);

        // 🔥 Build rich schema string
        let schemaString = "";

        schemaRows.forEach(col => {
            schemaString += `Column: ${col.column_name}\n`;
            schemaString += `Type: ${col.data_type}\n`;
            if (col.sample_values) {
                schemaString += `Possible Values: ${col.sample_values}\n`;
            }
            schemaString += "\n";
        });

        /* ==============================
           3️⃣ Generate SQL from AI
        ============================== */

        let generatedSQL = await generateSQL(
            schemaString,
            question,
            tableName
        );

        // 🔥 Clean SQL
        generatedSQL = generatedSQL.trim();

        if (generatedSQL.toLowerCase().includes("please enter any valid query")) {

            // 🔥 Save to MongoDB History Even for Rejections
            try {
                const history = new ChatHistory({
                    userId: req.user.id,
                    sessionId,
                    datasetId,
                    question,
                    sqlGenerated: null,
                    aiResponse: "Please enter any valid query related to the dataset.",
                });
                await history.save();
            } catch (histErr) {
                console.error("Failed to save rejection history:", histErr.message);
            }

            return res.json({
                answer: "Please enter any valid query related to the dataset.",
                sql: null,
                data: [],
                executionTime: 0
            });
        }

        if (generatedSQL.includes("SELECT")) {
            generatedSQL = generatedSQL.substring(
                generatedSQL.indexOf("SELECT")
            );
        }

        generatedSQL = generatedSQL.replace(/;$/, "").trim();

        // 🔥 Optional: enforce LIMIT safety
        if (!generatedSQL.toUpperCase().includes("LIMIT")) {
            generatedSQL += " LIMIT 1000";
        }

        console.log("Generated SQL:", generatedSQL);

        /* ==============================
           4️⃣ Validate SQL
        ============================== */

        const validation = validateSQL(
            generatedSQL,
            tableName,
            allowedColumns
        );

        console.log("Validation Result:", validation);

        if (!validation.valid) {
            return res.status(400).json({
                error: validation.error
            });
        }

        /* ==============================
           5️⃣ Execute SQL
        ============================== */

        const startTime = Date.now();
        console.log("Executing SQL:", generatedSQL);
        const [rows] = await connection.query(generatedSQL);
        const executionTime = (Date.now() - startTime) / 1000;

        /* ==============================
           6️⃣ Generate Explanation
        ============================== */

        let explanation = "";
        try {
            explanation = await generateExplanation(question, rows);
            // 🔥 Parse the JSON string from AI if applicable
            try {
                const parsed = JSON.parse(explanation);
                if (parsed.answer || parsed.explanation) {
                    explanation = parsed;
                }
            } catch (e) {
                // Not JSON, keep as string
            }
        } catch (aiErr) {
            console.error("Explanation Generator Failed:", aiErr);
            explanation = "Successfully executed the query, but failed to generate a natural language explanation.";
        }

        /* ==============================
           7️⃣ Log Query + Save History (skip if client aborted)
        ============================== */

        // Only reliable check: did the client's socket get destroyed?
        const clientGone = req.socket?.destroyed || res.writableEnded;
        if (clientGone) {
            console.log("Client disconnected — skipping DB save");
            connection.release();
            return;
        }

        await connection.query(
            `INSERT INTO query_logs 
             (dataset_id, user_question, generated_sql, execution_time)
             VALUES (?, ?, ?, ?)`,
            [datasetId, question, generatedSQL, executionTime]
        );

        /* ==============================
           7.5️⃣ Save to MongoDB
        ============================== */
        try {
            const aiResponseString = typeof explanation === 'object' ? JSON.stringify(explanation) : explanation;
            const history = new ChatHistory({
                userId: req.user.id,
                sessionId,
                datasetId,
                question,
                sqlGenerated: generatedSQL,
                aiResponse: aiResponseString,
                queryData: rows
            });
            await history.save();

            // Update Session Title if it is "New Chat"
            const ChatSession = require("../models/ChatSession");
            const session = await ChatSession.findById(sessionId);
            if (session && session.title === "New Chat") {
                session.title = question.substring(0, 30) + "...";
                await session.save();
            }
        } catch (mongoErr) {
            console.error("Failed to save chat history to MongoDB:", mongoErr.message);
        }

        /* ==============================
           8️⃣ Return Response
        ============================== */

        res.json({
            answer: explanation,
            sql: generatedSQL,
            data: rows,
            executionTime
        });

    } catch (err) {

        console.error("Query Error Details:", err.message, err.stack);

        res.status(500).json({
            error: "Query processing failed",
            details: err.message,
            stack: err.stack
        });

    } finally {
        connection.release();
    }
});

module.exports = router;