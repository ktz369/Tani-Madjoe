"""SQLAlchemy model for agronomic anomaly alerts and smart notifications."""

from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, Optional
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.plot import Plot


class Alert(Base):
    """SQLAlchemy model for automated agronomic alerts across 4 detection rules."""

    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    plot_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("plots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    alert_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )  # 'nitrogen_stress', 'water_stress', 'pest_anomaly', 'harvest_ready'
    severity: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )  # 'kuning', 'oranye', 'merah', 'hijau_tua'
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    trigger_values: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=True,
    )
    is_read: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
        index=True,
    )
    is_resolved: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # ORM Relationships
    plot: Mapped["Plot"] = relationship("Plot", back_populates="alerts")

    def __repr__(self) -> str:
        return (
            f"<Alert(id={self.id}, plot_id={self.plot_id}, type='{self.alert_type}', "
            f"severity='{self.severity}', is_resolved={self.is_resolved})>"
        )
