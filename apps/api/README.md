# Sindhai API

Backend microservice for Sindhai, built with [FastAPI](https://fastapi.tiangolo.com/).

## Architecture

This project follows **Clean Architecture** principles to ensure scalability and maintainability.

### Layers
- **Domain**: Core business logic and entities. Pure Python, no external dependencies.
- **Application**: Use cases and business rules. Orchestrates domain objects.
- **Infrastructure**: Adapters for external services (Neo4j, Qdrant, OpenAI, File System).
- **Interface**: API routes and controllers (FastAPI).

## Setup

This project uses [Poetry](https://python-poetry.org/) for dependency management.

### Prerequisites
- Python 3.9+
- Poetry

### Installation

```bash
cd apps/api
poetry install
```

### Running the Server

```bash
poetry run uvicorn apps.api.main:app --reload
```

## Testing

```bash
poetry run pytest
```
