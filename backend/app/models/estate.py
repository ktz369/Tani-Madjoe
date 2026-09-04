from datetime import datetime
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry
from app.database import Base

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.division import Division
    from app.models.weather_data import WeatherData


class Estate(Base):
    """SQLAlchemy model for agricultural estate / perkebunan unit."""

    __tablename__ = "estates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    company_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    location_point = mapped_column(
        Geometry(geometry_type="POINT", srid=4326),
        nullable=True,
    )
    province: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    kabupaten: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    company: Mapped["Company"] = relationship("Company", back_populates="estates")
    divisions: Mapped[List["Division"]] = relationship(
        "Division",
        back_populates="estate",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="Division.id",
    )
    weather_records: Mapped[List["WeatherData"]] = relationship(
        "WeatherData",
        back_populates="estate",
        cascade="all, delete-orphan",
        lazy="select",
        order_by="WeatherData.observation_date.desc()",
    )

    def __repr__(self) -> str:
        return f"<Estate(id={self.id}, name='{self.name}', company_id={self.company_id})>"
