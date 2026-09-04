from datetime import datetime
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.estate import Estate


class Company(Base):
    """SQLAlchemy model for agricultural parent company / enterprise."""

    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    estates: Mapped[List["Estate"]] = relationship(
        "Estate",
        back_populates="company",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="Estate.id",
    )

    def __repr__(self) -> str:
        return f"<Company(id={self.id}, name='{self.name}')>"
