from datetime import date, datetime
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, desc, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry
from app.database import Base

if TYPE_CHECKING:
    from app.models.alert import Alert
    from app.models.crop_variety import CropVariety
    from app.models.division import Division
    from app.models.gdd_accumulation import GddAccumulation
    from app.models.planting_season import PlantingSeason
    from app.models.spectral_index import SpectralIndex
    from app.models.operations import (
        PlotLaborLog,
        PlotIrrigationLog,
        PlotSaprotanApplication,
        PestScoutingReport,
        PostHarvestLog,
    )


class Plot(Base):
    """SQLAlchemy model for agricultural plot / petak lahan."""

    __tablename__ = "plots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    division_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("divisions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variety_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("crop_varieties.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    polygon = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326),
        nullable=False,
    )
    area_hectares: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=0.0,
        server_default="0.0",
    )
    planting_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    crop_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="padi",
        server_default="padi",
        index=True,
    )  # 'padi' or 'jagung'
    current_phase: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    current_hst: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    division: Mapped["Division"] = relationship("Division", back_populates="plots")
    variety: Mapped[Optional["CropVariety"]] = relationship("CropVariety", back_populates="plots")
    seasons: Mapped[List["PlantingSeason"]] = relationship(
        "PlantingSeason",
        back_populates="plot",
        cascade="all, delete-orphan",
        order_by="PlantingSeason.planting_date.desc()",
        lazy="selectin",
    )
    spectral_indices: Mapped[list["SpectralIndex"]] = relationship(
        "SpectralIndex",
        back_populates="plot",
        cascade="all, delete-orphan",
        order_by="SpectralIndex.observation_date.desc()",
    )
    gdd_records: Mapped[list["GddAccumulation"]] = relationship(
        "GddAccumulation",
        back_populates="plot",
        cascade="all, delete-orphan",
        order_by="GddAccumulation.observation_date.desc()",
    )
    alerts: Mapped[list["Alert"]] = relationship(
        "Alert",
        back_populates="plot",
        cascade="all, delete-orphan",
        order_by="Alert.created_at.desc()",
    )
    labor_logs: Mapped[list["PlotLaborLog"]] = relationship(
        "PlotLaborLog",
        back_populates="plot",
        cascade="all, delete-orphan",
        order_by="PlotLaborLog.activity_date.desc()",
    )
    irrigation_logs: Mapped[list["PlotIrrigationLog"]] = relationship(
        "PlotIrrigationLog",
        back_populates="plot",
        cascade="all, delete-orphan",
        order_by="PlotIrrigationLog.started_at.desc()",
    )
    saprotan_applications: Mapped[list["PlotSaprotanApplication"]] = relationship(
        "PlotSaprotanApplication",
        back_populates="plot",
        cascade="all, delete-orphan",
        order_by="PlotSaprotanApplication.application_date.desc()",
    )
    scouting_reports: Mapped[list["PestScoutingReport"]] = relationship(
        "PestScoutingReport",
        back_populates="plot",
        cascade="all, delete-orphan",
        order_by="PestScoutingReport.observation_date.desc()",
    )
    post_harvest_logs: Mapped[list["PostHarvestLog"]] = relationship(
        "PostHarvestLog",
        back_populates="plot",
        cascade="all, delete-orphan",
        order_by="PostHarvestLog.harvest_date.desc()",
    )

    def __repr__(self) -> str:
        return (
            f"<Plot(id={self.id}, name='{self.name}', crop_type='{self.crop_type}', "
            f"area={self.area_hectares}ha, division_id={self.division_id})>"
        )
