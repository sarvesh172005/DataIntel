from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os

# Load environment variables (like GROQ_API_KEY) before importing other modules
load_dotenv()

from sql_generator import generate_sql
from explanation_generator import generate_explanation
from report_generator import suggest_report_relationships

app = FastAPI()

# Allow frontend/backend origins from env, fallback to all
origins = os.environ.get("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SQLRequest(BaseModel):
    db_schema: str
    question: str
    table_name: str

class ExplanationRequest(BaseModel):
    question: str
    result: list

class SuggestReportRequest(BaseModel):
    schema_str: str
    sample_data: str

@app.post("/ai/test")
def test_ai():
    print("hii from AI service AI")
    return {"message": "AI received"}

@app.post("/generate-sql")
async def generate_sql_endpoint(req: SQLRequest):
    try:
        sql = await generate_sql(req.db_schema, req.question, req.table_name)
        return {"sql": sql}
    except Exception as e:
        print(f"SQL generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-explanation")
async def generate_explanation_endpoint(req: ExplanationRequest):
    try:
        explanation = await generate_explanation(req.question, req.result)
        return {"explanation": explanation}
    except Exception as e:
        print(f"Explanation generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/suggest-report")
async def suggest_report_endpoint(req: SuggestReportRequest):
    try:
        suggestions = await suggest_report_relationships(req.schema_str, req.sample_data)
        return {"suggestions": suggestions}
    except Exception as e:
        print(f"Report suggestion error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Keep-awake scheduler
from apscheduler.schedulers.background import BackgroundScheduler
import requests

scheduler = BackgroundScheduler()

def keep_awake():
    try:
        self_url = os.environ.get("SELF_URL", "https://dataintel-python-ai.onrender.com")
        requests.post(f"{self_url}/ai/test")
        print("AI Service Ping Success")
    except Exception as e:
        print(f"AI Service Ping Failed: {e}")

scheduler.add_job(keep_awake, 'interval', minutes=14)
scheduler.start()

@app.on_event("shutdown")
async def shutdown_event():
    scheduler.shutdown()
    from model import close_groq_client
    await close_groq_client()