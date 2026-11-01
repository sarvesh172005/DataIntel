const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../services/mysqlService');

const router = express.Router();

/* =========================================
   🔥 Multer Config With File Size Limit
========================================= */

const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

/* =========================================
   🚀 Upload Route
========================================= */

router.post('/', upload.single('file'), async (req, res) => {

    const connection = await pool.getConnection();

    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        let projectId = req.body.projectId || null;
        if (projectId === 'null' || projectId === 'undefined' || projectId === '') {
            projectId = null;
        }
        if (projectId) {
            projectId = parseInt(projectId, 10);
            if (isNaN(projectId)) {
                projectId = null;
            } else {
                const [proj] = await connection.query("SELECT id FROM projects WHERE id = ?", [projectId]);
                if (!proj || proj.length === 0) {
                    projectId = null;
                }
            }
        }

        const chatId = req.body.chatId || null;
        const filePath = req.file.path;
        const tableName = `dataset_${uuidv4().replace(/-/g, '')}`;

        const rows = [];
        const columns = [];

        /* =========================================
           1️⃣ Read CSV
        ========================================= */

        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('headers', (headers) => {
                    headers.forEach(h => {
                        const cleanHeader = h.replace(/^\uFEFF/, '').trim();
                        if (cleanHeader) columns.push(cleanHeader);
                    });
                })
                .on('data', (data) => rows.push(data))
                .on('end', resolve)
                .on('error', reject);
        });

        if (rows.length === 0) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: "CSV file is empty" });
        }

        await connection.beginTransaction();

        /* =========================================
           2️⃣ Detect Column Types + Sample Values
        ========================================= */

        const columnMeta = [];

        for (let col of columns) {

            const values = rows
                .map(r => r[col]?.trim())
                .filter(v => v !== undefined && v !== null && v !== "")
                .slice(0, 100);

            const uniqueValues = [...new Set(values)];

            let dataType = "VARCHAR(255)";
            let mysqlType = "VARCHAR(255) NULL";
            let sampleValues = null;

            const isNumeric = uniqueValues.length > 0 &&
                uniqueValues.every(v => !isNaN(Number(v)));

            if (isNumeric) {
                dataType = "DOUBLE";
                mysqlType = "DOUBLE NULL";
            } else if (uniqueValues.length <= 20) {
                sampleValues = uniqueValues.join(", ");
            }

            columnMeta.push({
                columnName: col,
                mysqlType,
                dataType,
                sampleValues
            });
        }

        /* =========================================
           3️⃣ Create Table
        ========================================= */

        const columnDefinitions = columnMeta.map(
            c => `\`${c.columnName}\` ${c.mysqlType}`
        );

        await connection.query(
            `CREATE TABLE \`${tableName}\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ${columnDefinitions.join(',')}
            )`
        );

        /* =========================================
           4️⃣ Batch Insert
        ========================================= */

        const batchSize = 1000;

        for (let i = 0; i < rows.length; i += batchSize) {

            const batch = rows.slice(i, i + batchSize);

            const values = batch.map(row =>
                columnMeta.map(meta => {
                    let val = row[meta.columnName]?.trim();
                    if (val === undefined || val === null || val === "" || val === "NA" || val === "N/A" || val === "null") {
                        return null;
                    }
                    if (meta.dataType === "DOUBLE") {
                        const num = Number(val);
                        return isNaN(num) ? null : num;
                    }
                    return val;
                })
            );

            await connection.query(
                `INSERT INTO \`${tableName}\`
                (${columns.map(c => `\`${c}\``).join(',')})
                VALUES ?`,
                [values]
            );
        }

        /* =========================================
           5️⃣ Auto Index Categorical Columns (Safe)
        ========================================= */

        let idxCounter = 0;
        for (let meta of columnMeta) {
            if (meta.sampleValues) {
                idxCounter++;
                const sanitizedCol = meta.columnName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 30);
                const indexName = `idx_${idxCounter}_${sanitizedCol}`;
                try {
                    await connection.query(
                        `CREATE INDEX \`${indexName}\`
                         ON \`${tableName}\` (\`${meta.columnName}\`)`
                    );
                } catch (idxErr) {
                    console.warn(`Skipping index creation for column ${meta.columnName}:`, idxErr.message);
                }
            }
        }

        /* =========================================
           6️⃣ Save Dataset Metadata
        ========================================= */

        const [datasetResult] = await connection.query(
            `INSERT INTO datasets (name, table_name, project_id, chat_id)
             VALUES (?, ?, ?, ?)`,
            [req.file.originalname, tableName, projectId, chatId]
        );

        const datasetId = datasetResult.insertId;

        /* =========================================
           7️⃣ Save Schema Metadata
        ========================================= */

        for (let meta of columnMeta) {
            await connection.query(
                `INSERT INTO dataset_schema
                (dataset_id, column_name, data_type, sample_values)
                VALUES (?, ?, ?, ?)`,
                [
                    datasetId,
                    meta.columnName,
                    meta.dataType,
                    meta.sampleValues
                ]
            );
        }

        await connection.commit();
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.json({
            message: "Dataset initialized successfully",
            datasetId,
            tableName
        });

    } catch (err) {

        await connection.rollback();

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        console.error("Upload Error:", err);

        res.status(500).json({
            error: "Dataset initialization failed",
            details: err.message
        });

    } finally {
        connection.release();
    }
});

/* =========================================
   🔥 Multer File Size Error Handler
========================================= */

router.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            error: "File too large. Max 50MB allowed."
        });
    }
    next(err);
});

module.exports = router;
