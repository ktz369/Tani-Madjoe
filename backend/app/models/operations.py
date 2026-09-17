"""SQLAlchemy ORM models for Precision Agriculture Operations."""
import enum
from datetime import date, datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Boolean, Date, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.plot import Plot


class TaskType(str, enum.Enum):
    olah_tanah = "olah_tanah"
    perbaikan_galengan = "perbaikan_galengan"
    pelumpuran = "pelumpuran"
    semai = "semai"
    tandur = "tandur"
    penyiangan = "penyiangan"
    pemupukan = "pemupukan"
    penyemprotan = "penyemprotan"
    panen = "panen"


class SaprotanCategory(str, enum.Enum):
    benih = "benih"
    pupuk_makro = "pupuk_makro"
    pupuk_mikro = "pupuk_mikro"
    pestisida = "pestisida"


class PestSeverity(str, enum.Enum):
    ringan = "ringan"
    sedang = "sedang"
    berat = "berat"


class WaterSource(str, enum.Enum):
    irigasi_tersier = "irigasi_tersier"
    pompa_diesel = "pompa_diesel"
    sumur_dalam = "sumur_dalam"


class PlotLaborLog(Base):
    """Log tenaga kerja harian / borongan (HOK)."""

    __tablename__ = "plot_labor_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    plot_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("plots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    activity_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    task_type: Mapped[TaskType] = mapped_column(
        Enum(TaskType, name="task_type_enum"),
        nullable=False,
    )
    labor_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    hours_worked: Mapped[float] = mapped_column(Float, nullable=False, default=7.0)
    wage_rate_per_day: Mapped[float] = mapped_column(Float, nullable=False, default=100000.0)
    is_contract: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    total_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationship
    plot: Mapped["Plot"] = relationship("Plot", back_populates="labor_logs")


class PlotIrrigationLog(Base):
    """Log pengairan, irigasi, dan konsumsi BBM pompa diesel."""

    __tablename__ = "plot_irrigation_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    plot_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("plots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    water_source: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=WaterSource.irigasi_tersier.value,
    )
    water_volume_m3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pump_duration_hours: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    fuel_liters: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    fuel_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ended_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    # Relationship
    plot: Mapped["Plot"] = relationship("Plot", back_populates="irrigation_logs")


class SaprotanItem(Base):
    """Katalog & inventori sarana produksi pertanian (saprotan)."""

    __tablename__ = "saprotan_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    category: Mapped[SaprotanCategory] = mapped_column(
        Enum(SaprotanCategory, name="saprotan_category_enum"),
        nullable=False,
    )
    active_ingredient: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    phi_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unit: Mapped[str] = mapped_column(String(50), nullable=False, default="kg")
    unit_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    stock_qty: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Relationship
    applications: Mapped[list["PlotSaprotanApplication"]] = relationship(
        "PlotSaprotanApplication",
        back_populates="item",
        cascade="all, delete-orphan",
    )


class PlotSaprotanApplication(Base):
    """Catatan riil aplikasi pupuk / pestisida / benih pada petak."""

    __tablename__ = "plot_saprotan_applications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    plot_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("plots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("saprotan_items.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    application_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    quantity_used: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Relationships
    plot: Mapped["Plot"] = relationship("Plot", back_populates="saprotan_applications")
    item: Mapped["SaprotanItem"] = relationship("SaprotanItem", back_populates="applications")


class PestScoutingReport(Base):
    """Laporan pengamatan hama & penyakit lapang (OPT) dengan koordinat GPS."""

    __tablename__ = "pest_scouting_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    plot_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("plots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    observation_date: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.now,
    )
    pest_type: Mapped[str] = mapped_column(String(100), nullable=False)
    severity: Mapped[PestSeverity] = mapped_column(
        Enum(PestSeverity, name="pest_severity_enum"),
        nullable=False,
        default=PestSeverity.ringan,
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    action_taken: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationship
    plot: Mapped["Plot"] = relationship("Plot", back_populates="scouting_reports")


class PostHarvestLog(Base):
    """Rekonsiliasi panen akhir musim dengan standardisasi kadar air 14%."""

    __tablename__ = "post_harvest_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    plot_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("plots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    harvest_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    gross_yield_kg: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    moisture_content_pct: Mapped[float] = mapped_column(Float, nullable=False, default=14.0)
    dockage_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    net_yield_kg: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    selling_price_per_kg: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    storage_location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Relationship
    plot: Mapped["Plot"] = relationship("Plot", back_populates="post_harvest_logs")
