import os
from pathlib import Path

from sqlalchemy import Column, Integer, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


Base = declarative_base()


class SolveJob(Base):
    __tablename__ = "solve_jobs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    objective = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default="done")


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")
Path("./data").mkdir(parents=True, exist_ok=True)
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
