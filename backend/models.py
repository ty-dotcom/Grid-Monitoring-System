from sqlalchemy import Integer, Float, DateTime, String, Column
from sqlalchemy.sql import func
from database import Base

class GridMetrics(Base):
    __tablename__ = 'grid_metrics'

    time = Column(DateTime(timezone=True), primary_key=True, default=func.now())
    line_id = Column(Integer, primary_key=True)
    voltage = Column(Float)
    line_load = Column(Float)
    anomaly_type = Column(String, nullable=True)

