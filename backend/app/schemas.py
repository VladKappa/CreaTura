from pydantic import BaseModel, Field


class SolveRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    x_max: int = Field(10, ge=0, le=1000)
    y_max: int = Field(10, ge=0, le=1000)


class SolveResponse(BaseModel):
    id: int
    name: str
    x: int
    y: int
    objective: int
    status: str
