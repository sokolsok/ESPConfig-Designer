FROM node:22-alpine AS frontend-build

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
COPY shared/ /shared/
RUN npm run build

FROM ghcr.io/esphome/esphome-hassio:2026.6.4

ENV LANG=C.UTF-8
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV PYTHONDONTWRITEBYTECODE=1

RUN python3 -m venv --system-site-packages /opt/designer-venv \
    && /opt/designer-venv/bin/python -m pip install --no-cache-dir -U pip \
    && /opt/designer-venv/bin/python -m pip install --no-cache-dir \
       flask==3.1.2 \
       pyserial==3.5

COPY backend/server.py /server.py
COPY backend/runtime_contract.py /runtime_contract.py
COPY backend/runtime_manifest.py /runtime_manifest.py
COPY backend/runtime_diagnostics.py /runtime_diagnostics.py
COPY shared/schema-catalog /schema-catalog
COPY run.sh /run.sh
COPY backend/seed_esphome /seed_esphome
COPY logo.png /logo.png
COPY --from=frontend-build /frontend/dist/ /web/
RUN chmod a+x /run.sh

ENTRYPOINT ["/run.sh"]
