"""Frozen Pydantic v2 contract models for the Security Digital Twin."""

from typing import Literal
from pydantic import BaseModel


class Asset(BaseModel, frozen=True):
    id: str
    name: str
    kind: Literal["server", "workstation", "database", "cloud_role", "share"]
    zone: str
    criticality: int
    crown_jewel: bool = False


class Identity(BaseModel, frozen=True):
    id: str
    name: str
    kind: Literal["user", "admin", "service_account", "cloud_role"]
    tier: int


class Edge(BaseModel, frozen=True):
    src: str
    dst: str
    technique: str


class ServiceFlow(BaseModel, frozen=True):
    id: str
    name: str
    src: str
    dst: str
    technique: str
    criticality: int


class Control(BaseModel, frozen=True):
    id: str
    name: str
    cost: int
    blocks: tuple[str, ...]
    scope: tuple[str, ...]
    efficacy: float


class Agent(BaseModel, frozen=True):
    id: str
    name: str
    start_zones: tuple[str, ...]
    capabilities: frozenset[str]
    objective: Literal["specific_target", "max_breadth", "exfil"]
    noise_budget: float
    skill: float


class Twin(BaseModel, frozen=True):
    id: str
    assets: tuple[Asset, ...]
    identities: tuple[Identity, ...]
    edges: tuple[Edge, ...]
    flows: tuple[ServiceFlow, ...]
    controls: tuple[Control, ...]
    parent_id: str | None = None
