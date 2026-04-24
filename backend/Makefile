.PHONY: install dev worker migrate shell test

install:
	uv sync --python 3.12

dev:
	uv run uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload

worker:
	uv run python -m arq app.tasks.worker.WorkerSettings

migrate:
	uv run alembic upgrade head

migration:
	uv run alembic revision --autogenerate -m "$(name)"

shell:
	uv run python -i -c "from app.main import app; from app.db.session import AsyncSessionLocal"

test:
	uv run pytest -v

docker-up:
	docker compose up -d postgres redis

docker-down:
	docker compose down
