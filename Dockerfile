# Один контейнер: FastAPI отдаёт и API, и собранный фронт.
FROM node:20-slim AS front
WORKDIR /front
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

FROM python:3.12-slim
RUN pip install --no-cache-dir uv
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/app ./app
COPY backend/scripts ./scripts
COPY --from=front /front/dist /app/static
ENV STATIC_DIR=/app/static DATABASE_URL=sqlite:////data/studio.db UPLOAD_DIR=/data/uploads COOKIE_SECURE=true
# Синтетические данные с общим паролем только на демо-стенде; на непустой базе сид сам откажется, данные не теряются
CMD ["sh", "-c", "mkdir -p /data && if [ \"$DEMO_LOGIN\" = true ]; then uv run --no-sync python scripts/seed_demo.py --out /tmp/seed.json || true; fi; exec uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
