from functools import lru_cache

from sindhai_api.infrastructure.config import load_settings
from sindhai_api.indexing.graph import Neo4jGraph
from sindhai_api.indexing.indexer import Indexer
from sindhai_api.indexing.vector import QdrantIndex
from sindhai_api.infrastructure.persistence.file_vault import FileVaultRepository as Vault

@lru_cache()
def get_settings():
    return load_settings()

@lru_cache()
def get_vault():
    settings = get_settings()
    return Vault(settings.vault_dir)

@lru_cache()
def get_graph():
    settings = get_settings()
    return Neo4jGraph(settings.neo4j_uri, settings.neo4j_username, settings.neo4j_password)

@lru_cache()
def get_vectors():
    settings = get_settings()
    return QdrantIndex(settings.qdrant_url)

@lru_cache()
def get_indexer():
    settings = get_settings()
    return Indexer(vault=get_vault(), graph=get_graph(), vectors=get_vectors())
