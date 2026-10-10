from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.services.ai_service import ask_sammy

router = APIRouter(prefix="/api/ai", tags=["ai"])

class AskRequest(BaseModel):
    question: str

@router.post("/ask")
def ask(data: AskRequest, db: Session = Depends(get_db), _=Depends(get_current_user)):
    if not data.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    answer = ask_sammy(data.question, db)
    return {"question": data.question, "answer": answer}
