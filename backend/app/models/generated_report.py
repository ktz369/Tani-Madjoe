"""SQLAlchemy model for generated report archives (PDF & CSV)."""

from datetime import date, datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.estate import Estate


class GeneratedReport(Base):
    """Model for persisted weekly and on-demand generated report archives."""

    __tablename__ = "generated_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    estate_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("estates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    report_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )  # 'health', 'harvest_prediction', 'water_usage', 'timeseries_csv'
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    period_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    period_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # Relationship
    estate: Mapped["Estate"] = relationship("Estate")

    def __repr__(self) -> str:
        return (
            f"<GeneratedReport(id={self.id}, estate_id={self.estate_id}, "
            f"type='{self.report_type}', title='{self.title}')>"
        )
