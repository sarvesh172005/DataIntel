const express = require("express");
const pool = require("../services/mysqlService");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * Helper to compute IQR boundaries and find outliers in an array of numbers
 */
function computeOutlierBounds(numbers) {
    if (!numbers || numbers.length < 4) {
        return null;
    }
    const sorted = [...numbers].sort((a, b) => a - b);
    const n = sorted.length;
    const q1Index = Math.floor(n * 0.25);
    const q3Index = Math.floor(n * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    return {
        q1,
        q3,
        iqr,
        lowerBound,
        upperBound,
        min: sorted[0],
        max: sorted[n - 1]
    };
}

/**
 * GET /quality/:id
 * Perform thorough Data Quality & Health Analysis
 */
router.get("/:id", authMiddleware, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const datasetId = req.params.id;

        const [dataset] = await connection.query(
            "SELECT table_name, name FROM datasets WHERE id = ?",
            [datasetId]
        );

        if (!dataset.length) {
            connection.release();
            return res.status(404).json({ error: "Dataset not found" });
        }

        const tableName = dataset[0].table_name;
        const datasetName = dataset[0].name;

        // Get schema
        const [columns] = await connection.query(
            "SELECT column_name, data_type, sample_values FROM dataset_schema WHERE dataset_id = ?",
            [datasetId]
        );

        // Get total rows
        const [countRes] = await connection.query(`SELECT COUNT(*) as total FROM \`${tableName}\``);
        const totalRows = countRes[0].total;

        if (totalRows === 0) {
            connection.release();
            return res.json({
                name: datasetName,
                tableName,
                totalRows: 0,
                totalColumns: columns.length,
                healthScore: 100,
                healthStatus: "Excellent",
                missingValues: { total: 0, percentage: 0, byColumn: {} },
                duplicates: { count: 0, percentage: 0 },
                outliers: { total: 0, percentage: 0, byColumn: {} },
                columnAnalysis: []
            });
        }

        // 1. Missing Values per Column
        const missingByColumn = {};
        let totalMissingCells = 0;
        const colNames = columns.map(c => c.column_name);

        for (const col of colNames) {
            const [missingRes] = await connection.query(
                `SELECT COUNT(*) as cnt FROM \`${tableName}\` WHERE \`${col}\` IS NULL OR TRIM(CAST(\`${col}\` AS CHAR)) = ''`
            );
            const count = missingRes[0].cnt;
            missingByColumn[col] = {
                count,
                percentage: Number(((count / totalRows) * 100).toFixed(2))
            };
            totalMissingCells += count;
        }

        // 2. Duplicate Rows Analysis
        let duplicateRowsCount = 0;
        if (colNames.length > 0) {
            const colsEscaped = colNames.map(c => `\`${c}\``).join(", ");
            const [dupRes] = await connection.query(
                `SELECT COUNT(*) as dup_groups, SUM(group_count - 1) as total_dups FROM (
                    SELECT ${colsEscaped}, COUNT(*) as group_count 
                    FROM \`${tableName}\` 
                    GROUP BY ${colsEscaped} 
                    HAVING COUNT(*) > 1
                ) as dup_subquery`
            );
            duplicateRowsCount = Number(dupRes[0]?.total_dups) || 0;
        }
        const duplicatePercentage = Number(((duplicateRowsCount / totalRows) * 100).toFixed(2));

        // 3. Outlier Analysis for numeric columns
        const [allData] = await connection.query(`SELECT * FROM \`${tableName}\``);
        const outliersByColumn = {};
        let totalOutlierValues = 0;
        let totalNumericCellsEvaluated = 0;

        const columnAnalysis = [];

        for (const col of columns) {
            const cName = col.column_name;
            const isNumeric = col.data_type === "DOUBLE" || col.data_type?.includes("INT") || col.data_type?.includes("DECIMAL") || col.data_type?.includes("FLOAT");

            // Extract non-null numeric values
            const numVals = allData
                .map(r => r[cName])
                .filter(v => v !== null && v !== undefined && v !== "" && !isNaN(Number(v)))
                .map(v => Number(v));

            let colOutlierInfo = null;

            if (isNumeric && numVals.length >= 4) {
                const bounds = computeOutlierBounds(numVals);
                if (bounds) {
                    const outliers = numVals.filter(v => v < bounds.lowerBound || v > bounds.upperBound);
                    const outlierCount = outliers.length;
                    totalOutlierValues += outlierCount;
                    totalNumericCellsEvaluated += numVals.length;

                    colOutlierInfo = {
                        count: outlierCount,
                        percentage: Number(((outlierCount / numVals.length) * 100).toFixed(2)),
                        lowerBound: Number(bounds.lowerBound.toFixed(2)),
                        upperBound: Number(bounds.upperBound.toFixed(2)),
                        min: bounds.min,
                        max: bounds.max,
                        sampleOutliers: outliers.slice(0, 5)
                    };
                    outliersByColumn[cName] = colOutlierInfo;
                }
            }

            columnAnalysis.push({
                name: cName,
                dataType: col.data_type,
                missingCount: missingByColumn[cName]?.count || 0,
                missingPercentage: missingByColumn[cName]?.percentage || 0,
                isNumeric,
                outlierInfo: colOutlierInfo
            });
        }

        const totalCells = totalRows * columns.length;
        const missingCellsPercentage = Number(((totalMissingCells / totalCells) * 100).toFixed(2));
        const outlierPercentage = totalNumericCellsEvaluated > 0 
            ? Number(((totalOutlierValues / totalNumericCellsEvaluated) * 100).toFixed(2)) 
            : 0;

        // 4. Dataset Health Score Calculation (0 - 100%)
        // Penalties:
        // Outlier penalty (40% weight): depends directly on outlier rate
        // Missing penalty (35% weight): percentage of missing cells
        // Duplicate penalty (25% weight): percentage of duplicate rows
        let healthScore = 100;
        healthScore -= (missingCellsPercentage * 0.8);
        healthScore -= (duplicatePercentage * 0.6);
        healthScore -= (outlierPercentage * 1.2);

        healthScore = Math.max(10, Math.min(100, Math.round(healthScore)));

        let healthStatus = "Excellent";
        if (healthScore < 50) healthStatus = "Critical";
        else if (healthScore < 70) healthStatus = "Poor";
        else if (healthScore < 85) healthStatus = "Fair";
        else if (healthScore < 95) healthStatus = "Good";

        connection.release();

        res.json({
            datasetId,
            name: datasetName,
            tableName,
            totalRows,
            totalColumns: columns.length,
            totalCells,
            healthScore,
            healthStatus,
            missingValues: {
                totalMissingCells,
                percentage: missingCellsPercentage,
                byColumn: missingByColumn
            },
            duplicates: {
                count: duplicateRowsCount,
                percentage: duplicatePercentage
            },
            outliers: {
                total: totalOutlierValues,
                percentage: outlierPercentage,
                byColumn: outliersByColumn
            },
            columnAnalysis
        });

    } catch (err) {
        if (connection) connection.release();
        console.error("Quality Analysis Error:", err);
        res.status(500).json({ error: "Failed to perform quality analysis", details: err.message });
    }
});

/**
 * POST /quality/:id/clean
 * Automated Cleaning:
 * - Fix missing values (numeric -> median/mean, categorical -> mode or 'Unknown')
 * - Remove duplicates
 * - Fix outliers (cap/clamp to IQR upper & lower bounds or remove)
 */
router.post("/:id/clean", authMiddleware, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const datasetId = req.params.id;
        const { 
            fixMissing = true, 
            removeDuplicates = true, 
            fixOutliers = true, 
            outlierStrategy = "cap" // "cap" (Winsorize to IQR bounds) or "remove"
        } = req.body;

        const [dataset] = await connection.query(
            "SELECT table_name, name FROM datasets WHERE id = ?",
            [datasetId]
        );

        if (!dataset.length) {
            connection.release();
            return res.status(404).json({ error: "Dataset not found" });
        }

        const tableName = dataset[0].table_name;
        const [columns] = await connection.query(
            "SELECT column_name, data_type FROM dataset_schema WHERE dataset_id = ?",
            [datasetId]
        );

        const colNames = columns.map(c => c.column_name);
        const [initialCountRes] = await connection.query(`SELECT COUNT(*) as total FROM \`${tableName}\``);
        const initialTotalRows = initialCountRes[0].total;

        let duplicatesRemoved = 0;
        let missingFixedCount = 0;
        let outliersCappedCount = 0;
        let outliersRowsRemoved = 0;

        await connection.beginTransaction();

        // 1. Remove duplicate rows
        if (removeDuplicates && colNames.length > 0) {
            // Create a temporary table with distinct rows and swap
            const colsEscaped = colNames.map(c => `\`${c}\``).join(", ");
            const tempTable = `temp_clean_${Date.now()}`;

            // Group by distinct content keeping the minimum id
            await connection.query(
                `CREATE TEMPORARY TABLE \`${tempTable}\` AS
                 SELECT MIN(id) as keep_id
                 FROM \`${tableName}\`
                 GROUP BY ${colsEscaped}`
            );

            const [delRes] = await connection.query(
                `DELETE FROM \`${tableName}\` 
                 WHERE id NOT IN (SELECT keep_id FROM \`${tempTable}\`)`
            );
            duplicatesRemoved = delRes.affectedRows || 0;
            await connection.query(`DROP TEMPORARY TABLE IF EXISTS \`${tempTable}\``);
        }

        // 2. Fix Outliers
        if (fixOutliers) {
            const [currentData] = await connection.query(`SELECT * FROM \`${tableName}\``);

            for (const col of columns) {
                const cName = col.column_name;
                const isNumeric = col.data_type === "DOUBLE" || col.data_type?.includes("INT") || col.data_type?.includes("DECIMAL") || col.data_type?.includes("FLOAT");

                if (isNumeric) {
                    const numVals = currentData
                        .map(r => r[cName])
                        .filter(v => v !== null && v !== undefined && v !== "" && !isNaN(Number(v)))
                        .map(v => Number(v));

                    if (numVals.length >= 4) {
                        const bounds = computeOutlierBounds(numVals);
                        if (bounds) {
                            if (outlierStrategy === "cap") {
                                // Cap values outside IQR bounds
                                const [lowUpdate] = await connection.query(
                                    `UPDATE \`${tableName}\` SET \`${cName}\` = ? WHERE \`${cName}\` < ?`,
                                    [Number(bounds.lowerBound.toFixed(2)), bounds.lowerBound]
                                );
                                const [highUpdate] = await connection.query(
                                    `UPDATE \`${tableName}\` SET \`${cName}\` = ? WHERE \`${cName}\` > ?`,
                                    [Number(bounds.upperBound.toFixed(2)), bounds.upperBound]
                                );
                                outliersCappedCount += (lowUpdate.affectedRows || 0) + (highUpdate.affectedRows || 0);
                            } else if (outlierStrategy === "remove") {
                                const [delOutliers] = await connection.query(
                                    `DELETE FROM \`${tableName}\` WHERE \`${cName}\` < ? OR \`${cName}\` > ?`,
                                    [bounds.lowerBound, bounds.upperBound]
                                );
                                outliersRowsRemoved += delOutliers.affectedRows || 0;
                            }
                        }
                    }
                }
            }
        }

        // 3. Fix Missing Values
        if (fixMissing) {
            const [activeData] = await connection.query(`SELECT * FROM \`${tableName}\``);

            for (const col of columns) {
                const cName = col.column_name;
                const isNumeric = col.data_type === "DOUBLE" || col.data_type?.includes("INT") || col.data_type?.includes("DECIMAL") || col.data_type?.includes("FLOAT");

                if (isNumeric) {
                    // Compute average/median
                    const validNums = activeData
                        .map(r => r[cName])
                        .filter(v => v !== null && v !== undefined && v !== "" && !isNaN(Number(v)))
                        .map(v => Number(v));

                    if (validNums.length > 0) {
                        const avg = validNums.reduce((a, b) => a + b, 0) / validNums.length;
                        const roundedAvg = Number(avg.toFixed(2));
                        const [fillRes] = await connection.query(
                            `UPDATE \`${tableName}\` SET \`${cName}\` = ? WHERE \`${cName}\` IS NULL`,
                            [roundedAvg]
                        );
                        missingFixedCount += fillRes.affectedRows || 0;
                    }
                } else {
                    // Find mode (most frequent value)
                    const strVals = activeData
                        .map(r => r[cName])
                        .filter(v => v !== null && v !== undefined && String(v).trim() !== "");

                    let replacement = "Unknown";
                    if (strVals.length > 0) {
                        const freq = {};
                        strVals.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
                        replacement = Object.keys(freq).reduce((a, b) => freq[a] > freq[b] ? a : b);
                    }

                    const [fillRes] = await connection.query(
                        `UPDATE \`${tableName}\` SET \`${cName}\` = ? WHERE \`${cName}\` IS NULL OR TRIM(CAST(\`${cName}\` AS CHAR)) = ''`,
                        [replacement]
                    );
                    missingFixedCount += fillRes.affectedRows || 0;
                }
            }
        }

        await connection.commit();

        const [finalCountRes] = await connection.query(`SELECT COUNT(*) as total FROM \`${tableName}\``);
        const finalTotalRows = finalCountRes[0].total;

        connection.release();

        res.json({
            success: true,
            message: "Dataset cleaned and optimized successfully!",
            actionsTaken: {
                duplicatesRemoved,
                missingFixedCount,
                outliersCappedCount,
                outliersRowsRemoved,
                initialTotalRows,
                finalTotalRows
            }
        });

    } catch (err) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error("Clean Dataset Error:", err);
        res.status(500).json({ error: "Failed to clean dataset", details: err.message });
    }
});

/**
 * GET /quality/:id/export
 * Export the current (cleaned) dataset as CSV for download
 */
router.get("/:id/export", authMiddleware, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const datasetId = req.params.id;

        const [dataset] = await connection.query(
            "SELECT table_name, name FROM datasets WHERE id = ?",
            [datasetId]
        );

        if (!dataset.length) {
            connection.release();
            return res.status(404).json({ error: "Dataset not found" });
        }

        const tableName = dataset[0].table_name;
        let baseName = dataset[0].name.replace(/\.[^/.]+$/, ""); // strip existing extension
        const filename = `${baseName}_cleaned.csv`;

        // Get schema columns to omit internal primary key 'id'
        const [schemaCols] = await connection.query(
            "SELECT column_name FROM dataset_schema WHERE dataset_id = ?",
            [datasetId]
        );

        const columns = schemaCols.map(c => c.column_name);
        const colList = columns.length > 0 ? columns.map(c => `\`${c}\``).join(", ") : "*";

        const [rows] = await connection.query(`SELECT ${colList} FROM \`${tableName}\``);
        connection.release();

        if (rows.length === 0) {
            return res.status(400).json({ error: "Dataset has no rows to export" });
        }

        // Convert rows to CSV format
        const csvHeaders = columns.length > 0 ? columns : Object.keys(rows[0]);
        const escapeCSVValue = (val) => {
            if (val === null || val === undefined) return "";
            const str = String(val);
            if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const headerLine = csvHeaders.map(escapeCSVValue).join(",");
        const dataLines = rows.map(row => 
            csvHeaders.map(col => escapeCSVValue(row[col])).join(",")
        );

        const csvContent = [headerLine, ...dataLines].join("\r\n");

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.status(200).send(csvContent);

    } catch (err) {
        if (connection) connection.release();
        console.error("Export Dataset CSV Error:", err);
        res.status(500).json({ error: "Failed to export dataset CSV", details: err.message });
    }
});

module.exports = router;

