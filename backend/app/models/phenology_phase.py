from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.crop_variety import CropVariety


class PhenologyPhase(Base):
    """SQLAlchemy model for crop phenological growth phases."""

    __tablename__ = "phenology_phases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    variety_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("crop_varieties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    phase_code: Mapped[str] = mapped_column(String(50), nullable=False)
    phase_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hst_start: Mapped[int] = mapped_column(Integer, nullable=False)
    hst_end: Mapped[int] = mapped_column(Integer, nullable=False)
    ndvi_expected_min: Mapped[float] = mapped_column(Float, nullable=False)
    ndvi_expected_max: Mapped[float] = mapped_column(Float, nullable=False)
    ndre_threshold: Mapped[float] = mapped_column(Float, nullable=False)
    kc_value: Mapped[float] = mapped_column(Float, nullable=False)
    gdd_target: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    variety: Mapped["CropVariety"] = relationship("CropVariety", back_populates="phases")

    __table_args__ = (
        UniqueConstraint("variety_id", "phase_code", name="uq_variety_phase_code"),
        CheckConstraint("hst_start <= hst_end", name="chk_phase_hst_range"),
        CheckConstraint("kc_value > 0", name="chk_phase_kc_positive"),
    )

    def __repr__(self) -> str:
        return (
            f"<PhenologyPhase(id={self.id}, variety_id={self.variety_id}, "
            f"phase_code='{self.phase_code}', phase_name='{self.phase_name}', "
            f"hst={self.hst_start}-{self.hst_end})>"
        )
