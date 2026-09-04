from datetime import date, datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.estate import Estate


class WeatherData(Base):
    """SQLAlchemy model for estate daily historical and forecast weather observations."""

    __tablename__ = "weather_data"
    __table_args__ = (
        UniqueConstraint(
            "estate_id",
            "observation_date",
            "is_forecast",
            name="uq_estate_weather_observation",
        ),
        Index("ix_weather_data_estate_date", "estate_id", "observation_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    estate_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("estates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    observation_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    temp_max_c: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    temp_min_c: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    humidity_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    wind_speed_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    solar_radiation_mjm2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rainfall_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    et0_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_forecast: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    estate: Mapped["Estate"] = relationship("Estate", back_populates="weather_records")

    def __repr__(self) -> str:
        return (
            f"<WeatherData(id={self.id}, estate_id={self.estate_id}, "
            f"date={self.observation_date}, is_forecast={self.is_forecast}, "
            f"temp_max={self.temp_max_c}, temp_min={self.temp_min_c}, et0={self.et0_mm})>"
        )
