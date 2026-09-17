from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.company import Company


class User(Base):
    """SQLAlchemy model for application users."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    company_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("companies.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="user", server_default="user")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    company: Mapped[Optional["Company"]] = relationship("Company", lazy="select")

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email='{self.email}', role='{self.role}', company_id={self.company_id})>"

