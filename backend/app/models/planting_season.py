from datetime import date, datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.crop_variety import CropVariety
    from app.models.plot import Plot


class PlantingSeason(Base):
    """SQLAlchemy model for planting seasons (musim tanam) per plot."""

    __tablename__ = "planting_seasons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    plot_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("plots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variety_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("crop_varieties.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    planting_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    harvest_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="active",
        server_default="active",
        index=True,
    )  # 'active', 'harvested', 'failed'
    yield_estimate_ton_per_ha: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    plot: Mapped["Plot"] = relationship("Plot", back_populates="seasons")
    variety: Mapped[Optional["CropVariety"]] = relationship("CropVariety", back_populates="seasons")

    def __repr__(self) -> str:
        return (
            f"<PlantingSeason(id={self.id}, plot_id={self.plot_id}, "
            f"variety_id={self.variety_id}, status='{self.status}', "
            f"planting_date={self.planting_date})>"
        )
