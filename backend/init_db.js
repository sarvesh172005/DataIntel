const pool = require("./services/mysqlService");

const createTables = async () => {
    console.log("Connecting to MySQL and ensuring initial tables exist...");
    try {
        const connection = await pool.getConnection();

        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS projects (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS datasets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) DEFAULT NULL,
                table_name VARCHAR(255) DEFAULT NULL,
                uploaded_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                project_id INT DEFAULT NULL,
                chat_id VARCHAR(255) DEFAULT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS dataset_schema (
                id INT AUTO_INCREMENT PRIMARY KEY,
                dataset_id INT DEFAULT NULL,
                column_name VARCHAR(255) DEFAULT NULL,
                data_type VARCHAR(100) DEFAULT NULL,
                sample_values TEXT,
                FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                dataset_id INT NOT NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                conversation_id INT NOT NULL,
                role ENUM('user','ai') NOT NULL,
                question TEXT,
                answer TEXT,
                generated_sql TEXT,
                execution_time DECIMAL(10,4) DEFAULT NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS query_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                dataset_id INT DEFAULT NULL,
                user_question TEXT,
                generated_sql TEXT,
                execution_time FLOAT DEFAULT NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        connection.release();
        console.log("MySQL schema initialized successfully!");
    } catch (err) {
        console.error("Failed to initialize MySQL schema:", err.message);
    }
};

if (require.main === module) {
    createTables().then(() => process.exit(0));
} else {
    module.exports = createTables;
}

