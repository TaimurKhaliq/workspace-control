"""Discovery providers that materialize source-agnostic workspace targets."""

from .base import DiscoveryProvider
from .git_url import GitUrlProvider
from .local_path import LocalPathProvider
from .remote_agent import RemoteAgentProvider

__all__ = [
    "DiscoveryProvider",
    "GitUrlProvider",
    "LocalPathProvider",
    "RemoteAgentProvider",
]
