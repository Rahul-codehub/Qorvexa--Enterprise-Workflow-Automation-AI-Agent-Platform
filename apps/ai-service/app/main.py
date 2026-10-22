"""Bounded AI task service for Qorvexa.

This service returns validated task results only. It never accesses the database,
authorizes users, or performs workflow actions.
"""
from os import getenv
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Qorvexa AI Service", version="0.1.0")


class TaskRequest(BaseModel):
    task: Literal["classify", "extract", "summarize"]
    input: str = Field(min_length=1, max_length=20_000)
    output_schema: dict[str, Any] = Field(default_factory=dict)


class TaskResponse(BaseModel):
    provider: Literal["mock", "groq"]
    result: dict[str, Any]
    warning: str | None = None


@app.get("/health")
async def health() -> dict[str, str]:
    return {"service": "ai-service", "status": "ok", "provider": getenv("AI_PROVIDER", "mock")}


@app.post("/v1/tasks/execute", response_model=TaskResponse)
async def execute_task(request: TaskRequest) -> TaskResponse:
    provider = getenv("AI_PROVIDER", "mock")
    if provider != "mock":
        raise HTTPException(status_code=501, detail="Only the explicitly labelled mock provider is configured in this foundation.")
    if request.task == "classify":
        result = {"label": "unclassified", "confidence": 0.0}
    elif request.task == "extract":
        result = {"fields": {}}
    else:
        result = {"summary": request.input[:280]}
    return TaskResponse(provider="mock", result=result, warning="Mock provider response; no external model was called.")
