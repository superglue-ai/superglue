"""A client library for accessing superglue AI API"""

from .client import AuthenticatedClient, Client

# Alias for better DX
SuperglueClient = AuthenticatedClient

__all__ = (
    "SuperglueClient",
    "AuthenticatedClient",
    "Client",
)
