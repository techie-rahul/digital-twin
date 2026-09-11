"""Attacker state tracking for cyber digital twin simulations."""

from typing import Iterable, Optional, Tuple


class AttackerState:
    """Tracks position, capabilities, privileges, compromised nodes, and path of an adversary.

    All collections are stored as immutable types (frozenset, tuple) to prevent
    mutation leaks across simulation branches and ensure deterministic state deduplication.
    """

    def __init__(
        self,
        current_node: str,
        capabilities: Optional[Iterable[str]] = None,
        privileges: Optional[Iterable[str]] = None,
        compromised_nodes: Optional[Iterable[str]] = None,
        path: Optional[Iterable[str]] = None,
    ):
        self.current_node: str = current_node
        self.capabilities: frozenset[str] = (
            frozenset(capabilities) if capabilities else frozenset()
        )
        self.privileges: frozenset[str] = (
            frozenset(privileges) if privileges else frozenset()
        )

        if compromised_nodes is not None:
            self.compromised_nodes: frozenset[str] = (
                frozenset(compromised_nodes) | frozenset([current_node])
            )
        else:
            self.compromised_nodes = frozenset([current_node])

        if path is not None:
            self.path: tuple[str, ...] = tuple(path)
            if not self.path:
                self.path = (current_node,)
        else:
            self.path = (current_node,)

    def has_capability(self, name: str) -> bool:
        """Check if attacker possesses a specific capability."""
        return name in self.capabilities

    def has_privilege(self, name: str) -> bool:
        """Check if attacker possesses a specific privilege."""
        return name in self.privileges

    def add_capability(self, name: str) -> "AttackerState":
        """Grant a capability (updates state immutably)."""
        self.capabilities = self.capabilities | frozenset([name])
        return self

    def add_privilege(self, name: str) -> "AttackerState":
        """Grant a privilege (updates state immutably)."""
        self.privileges = self.privileges | frozenset([name])
        return self

    def move_to(self, node: str) -> "AttackerState":
        """Move to a new node, marking it compromised and appending to path."""
        self.current_node = node
        self.compromised_nodes = self.compromised_nodes | frozenset([node])
        self.path = (*self.path, node)
        return self

    def clone(self) -> "AttackerState":
        """Create an independent copy for search branching."""
        return AttackerState(
            current_node=self.current_node,
            capabilities=self.capabilities,
            privileges=self.privileges,
            compromised_nodes=self.compromised_nodes,
            path=self.path,
        )

    def state_key(self) -> Tuple[str, frozenset[str], frozenset[str]]:
        """Hashable tuple representation for visited-state deduplication."""
        return (
            self.current_node,
            self.capabilities,
            self.privileges,
        )

    def search_key(self) -> Tuple[str, frozenset[str]]:
        """Algorithm A search key: (node, frozenset(capabilities_held))."""
        return (
            self.current_node,
            self.capabilities,
        )

    def __hash__(self) -> int:
        return hash((self.current_node, self.capabilities, self.privileges, self.path))

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, AttackerState):
            return False
        return (
            self.current_node == other.current_node
            and self.capabilities == other.capabilities
            and self.privileges == other.privileges
            and self.compromised_nodes == other.compromised_nodes
            and self.path == other.path
        )

    def __repr__(self) -> str:
        return (
            f"AttackerState(current_node={self.current_node!r}, "
            f"capabilities={sorted(self.capabilities)!r}, "
            f"privileges={sorted(self.privileges)!r}, "
            f"compromised_nodes={sorted(self.compromised_nodes)!r}, "
            f"path={self.path!r})"
        )
