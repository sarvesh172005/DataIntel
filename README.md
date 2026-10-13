# DataIntel 🧠📊

DataIntel is a powerful, full-stack AI-driven application that allows users to upload datasets (CSV) and interactively query them using natural language. Under the hood, it automatically translates plain English questions into valid SQL queries, executes them against a dynamically generated schema, and visualizes the results using modern, responsive charts. 

DataIntel provides a seamless chat-like interface to analyze databases without needing to write a single line of code!

---

## 🎯 Features
- **Natural Language to SQL**: Powered by **Llama 3.1 8B**, DataIntel converts user questions into highly optimized SQL queries.
- **Dynamic Dataset Upload**: Users can upload CSV files, which are automatically parsed, structured, and imported into a managed MySQL database.
- **Smart Data Visualizations**: Automatically determines the best way to represent the queried data (Bar charts, Pie charts, Line charts) based on the result structure.
- **AI-Generated Explanations**: Not only does it return the raw data, but the AI also generates a human-readable summary of the insights found.
- **Project & Session Management**: Organize datasets into projects and maintain isolated chat sessions for context-aware conversations.
- **History Tracking**: All interactions, generated SQL, and AI responses are saved to MongoDB, allowing users to revisit past analyses.
- **Export to PDF**: Generate clean, professional PDF reports of the entire analysis chat.

---

## 🏗️ Architecture Stack

DataIntel is built using a modern decoupled architecture:

### 1. Frontend (React + Vite)
- **Framework**: React 19, Vite
- **Styling**: Tailwind CSS, Lucide Icons
- **Data Visualization**: Recharts
- **Routing**: React Router DOM
- **State Management**: React Hooks
- **PDF Generation**: html2canvas, jsPDF

### 2. Backend (Node.js + Express)
- **Runtime**: Node.js
- **Framework**: Express.js
- **Authentication**: JWT & bcryptjs
- **File Upload**: Multer, csv-parser
- **Security**: CORS, SQL Validator (node-sql-parser)
- **Databases**: 
  - **MySQL2**: Relational data storage for datasets and dynamic schemas.
  - **Mongoose (MongoDB)**: NoSQL storage for user profiles, chat histories, and project metadata.

### 3. AI Service (Python + FastAPI)
- **Framework**: FastAPI
- **LLM Integration**: Groq API (AsyncGroq)
- **Model**: `llama-3.1-8b-instant`
- **Role**: Dedicated microservice for handling prompt construction, SQL generation, and natural language explanations.

---

## 📂 Folder Structure

```text
DataIntel/
├── frontend/               # React User Interface
│   ├── src/
│   │   ├── components/     # Reusable UI components (ChatLayout, ChartRenderer)
│   │   ├── pages/          # Full page views (Dashboard, Login, Landing)
│   │   ├── services/       # Axios API client functions
│   │   └── App.jsx         # Main React App component
│   ├── index.html
│   ├── tailwind.config.js
│   └── package.json
│
├── backend/                # Node.js Express API
│   ├── config/             # Environment configs
│   ├── middleware/         # Auth, SQL validation
│   ├── models/             # Mongoose schemas (User, ChatHistory, etc.)
│   ├── routes/             # API Endpoints (auth, upload, query, datasets)
│   ├── services/           # MySQL pool, MongoDB connection, AI internal client
│   └── server.js           # Express App Entry Point
│
├── ai_service/             # FastAPI Python Microservice
│   ├── app.py              # FastAPI endpoints (/generate-sql, /generate-explanation)
│   ├── main.py             # App configuration and CORS
│   ├── model.py            # Persistent AsyncGroq LLM Client
│   ├── sql_generator.py    # Logic for SQL prompt injection
│   ├── explanation_generator.py # Logic for Natural Language Summaries
│   └── requirements.txt    # Python dependencies
│
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
To run DataIntel locally, you will need:
- Node.js (v18+)
- Python (3.11+)
- MySQL Server (Local or Managed)
- MongoDB (Local or Atlas URI)
- Groq API Key

### 1. Setup AI Service (FastAPI)
Navigate to the `ai_service` directory and install dependencies:
```bash
cd ai_service
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in `ai_service` and add your Groq key:
```env
GROQ_API_KEY=your_groq_api_key_here
```

Start the service:
```bash
uvicorn app:app --port 8001 --reload
```

### 2. Setup Backend (Node.js)
Open a new terminal, navigate to the `backend` directory:
```bash
cd backend
npm install
```

Create a `.env` file in `backend`:
```env
PORT=5000
MYSQL_HOST=localhost
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=dataintel_db
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_super_secret_jwt_key
AI_SERVICE_URL=http://localhost:8001
```

Start the backend server:
```bash
npm run dev
# or
node server.js
```

### 3. Setup Frontend (React)
Open a third terminal, navigate to the `frontend` directory:
```bash
cd frontend
npm install
```

Create a `.env` file in `frontend`:
```env
VITE_API_BASE_URL=http://localhost:5000
```

Start the development server:
```bash
npm run dev
```

---

## 💡 Usage

1. Open your browser and navigate to `http://localhost:5173`.
2. Register for a new account and log in.
3. Create a **New Project**.
4. Inside the project dashboard, select **Upload Dataset** and upload a valid `.csv` file.
5. Click on **New Chat** and select your uploaded dataset from the 'Targeting' dropdown at the top.
6. Ask a question! Examples:
    * *"How are the customers distributed by gender?"*
    * *"What is the total revenue by payment method?"*
    * *"Show me the top 5 longest tenured customers."*
7. Review the generated charts and the AI's explanation.
8. Click **Export Chat** to save your analysis as a PDF report.

---

## 🛡️ Security Note
The backend implements a lightweight SQL Validator (`node-sql-parser`) before executing generated queries against the MySQL database. It strictly ensures that only `SELECT` queries are executed to prevent destructive `DROP`, `DELETE`, or `UPDATE` operations by the AI or user injections.

---

