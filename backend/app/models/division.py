from datetime import datetime
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.estate import Estate
    from app.models.plot import Plot


class Division(Base):
    """SQLAlchemy model for estate operational division / afdeling."""

    __tablename__ = "divisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    estate_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("estates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    estate: Mapped["Estate"] = relationship("Estate", back_populates="divisions")
    plots: Mapped[List["Plot"]] = relationship(
        "Plot",
        back_populates="division",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="Plot.id",
    )

    def __repr__(self) -> str:
        return f"<Division(id={self.id}, name='{self.name}', estate_id={self.estate_id})>"

