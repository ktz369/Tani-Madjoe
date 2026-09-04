from datetime import datetime
from typing import List, TYPE_CHECKING
from sqlalchemy import DateTime, Float, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.phenology_phase import PhenologyPhase
    from app.models.planting_season import PlantingSeason
    from app.models.plot import Plot


class CropVariety(Base):
    """SQLAlchemy model for agricultural crop varieties (padi & jagung)."""

    __tablename__ = "crop_varieties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    crop_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # 'padi' or 'jagung'
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    cycle_days: Mapped[int] = mapped_column(Integer, nullable=False)
    t_base: Mapped[float] = mapped_column(Float, nullable=False, default=10.0, server_default="10.0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    phases: Mapped[List["PhenologyPhase"]] = relationship(
        "PhenologyPhase",
        back_populates="variety",
        cascade="all, delete-orphan",
        order_by="PhenologyPhase.hst_start",
        lazy="selectin",
    )
    plots: Mapped[List["Plot"]] = relationship(
        "Plot",
        back_populates="variety",
        lazy="selectin",
    )
    seasons: Mapped[List["PlantingSeason"]] = relationship(
        "PlantingSeason",
        back_populates="variety",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("crop_type", "name", name="uq_crop_variety_name_per_type"),
    )

    def __repr__(self) -> str:
        return f"<CropVariety(id={self.id}, name='{self.name}', crop_type='{self.crop_type}', cycle_days={self.cycle_days})>"

