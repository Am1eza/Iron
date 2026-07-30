# Self-hosted currency/gold scraper for the نبض بازار ticker — see the
# top-of-file comment in web/src/lib/server/integrations/tgju.ts for why
# (no official tgju.org API) and docker-compose.yml's `tgju` service for how
# this fits into the stack.
#
# Vendors github.com/BlackIQ/tgju-api at a PINNED commit (bump TGJU_API_REF
# below deliberately, never silently) via `git clone` in a build stage —
# their own Dockerfile ships broken as of that commit (references a
# requirements.txt/wsgi.py that don't exist in their actual pyproject.toml
# + uv-based project), so this Dockerfile installs correctly from their real
# pyproject.toml/uv.lock instead of depending on their broken one.
FROM python:3.13-alpine AS source
RUN apk add --no-cache git
WORKDIR /src
ARG TGJU_API_REF=18075836f50b12bb31f5c1d90553f00e51432895
RUN git clone --quiet https://github.com/BlackIQ/tgju-api.git . \
    && git checkout --quiet "${TGJU_API_REF}"

FROM python:3.13-alpine
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY --from=source /src/pyproject.toml /src/uv.lock ./
RUN uv sync --frozen --no-cache
COPY --from=source /src/main.py ./
COPY --from=source /src/routers ./routers
COPY --from=source /src/schemas ./schemas
COPY --from=source /src/scrap ./scrap
EXPOSE 8000
CMD ["uv", "run", "fastapi", "run", "main.py", "--port", "8000"]
