from datetime import date, datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.plot import Plot


class SpectralIndex(Base):
    """SQLAlchemy model for satellite spectral indices and SAR observations per agricultural plot."""

    __tablename__ = "spectral_indices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    plot_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("plots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    observation_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    satellite: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="sentinel-2",
        server_default="sentinel-2",
        index=True,
    )  # 'sentinel-2' or 'sentinel-1'
    ndvi: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ndre: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ndwi: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    savi: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bsi: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sar_vv_db: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sar_vh_db: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cloud_cover_pct: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        default=0.0,
        server_default="0.0",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    plot: Mapped["Plot"] = relationship("Plot", back_populates="spectral_indices")

    __table_args__ = (
        UniqueConstraint(
            "plot_id",
            "observation_date",
            "satellite",
            name="uq_plot_obs_satellite",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<SpectralIndex(id={self.id}, plot_id={self.plot_id}, date={self.observation_date}, "
            f"satellite='{self.satellite}', ndvi={self.ndvi})>"
        )
