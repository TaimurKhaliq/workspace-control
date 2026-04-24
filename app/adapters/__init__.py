"""Adapter implementations for deterministic architecture evidence collection."""

from .angular import AngularAdapter
from .events import EventsAdapter
from .flyway import FlywayAdapter
from .openapi import OpenAPIAdapter
from .react import ReactAdapter
from .spring_boot import SpringBootAdapter

__all__ = [
    "AngularAdapter",
    "EventsAdapter",
    "FlywayAdapter",
    "OpenAPIAdapter",
    "ReactAdapter",
    "SpringBootAdapter",
]
