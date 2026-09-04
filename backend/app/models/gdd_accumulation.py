"""SQLAlchemy model for Growing Degree Days (GDD) accumulation and phenology predictions."""

from datetime import date, datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.plot import Plot


class GddAccumulation(Base):
    """SQLAlchemy model for daily GDD accumulation and phenological predictions."""

    __tablename__ = "gdd_accumulation"
    __table_args__ = (
        UniqueConstraint("plot_id", "observation_date", name="uq_plot_gdd_obs_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    plot_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("plots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    observation_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    gdd_daily: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0.0")
    gdd_cumulative: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0.0")
    etc_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    predicted_phase: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    predicted_harvest_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    plot: Mapped["Plot"] = relationship("Plot", back_populates="gdd_records")

    def __repr__(self) -> str:
        return (
            f"<GddAccumulation(id={self.id}, plot_id={self.plot_id}, date={self.observation_date}, "
            f"daily={self.gdd_daily}, cumulative={self.gdd_cumulative}, phase='{self.predicted_phase}')>"
        )
