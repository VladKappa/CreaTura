import os
from datetime import datetime
from pathlib import Path

from sqlalchemy import Column, DateTime, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


Base = declarative_base()


class AppState(Base):
    __tablename__ = "app_state"

    key = Column(String, primary_key=True, index=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")
# Motivatie:
# - folderul `./data` este montat ca volum in Docker,
# - baza SQLite ramane persistenta intre restart/rebuild,
# - `check_same_thread=False` este necesar pentru accesul din worker-ele FastAPI.
Path("./data").mkdir(parents=True, exist_ok=True)
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
