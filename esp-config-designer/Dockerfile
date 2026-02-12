FROM ghcr.io/esphome/esphome-hassio:2026.1.4

ENV LANG=C.UTF-8
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV PYTHONDONTWRITEBYTECODE=1

RUN python3 -m venv /opt/designer-venv \
    && /opt/designer-venv/bin/python -m pip install --no-cache-dir -U pip \
    && /opt/designer-venv/bin/python -m pip install --no-cache-dir flask==3.1.2

COPY server.py /server.py
COPY run.sh /run.sh
COPY seed_esphome /seed_esphome
COPY logo.png /logo.png
COPY web /web
RUN chmod a+x /run.sh

ENTRYPOINT ["/run.sh"]
