FROM python:3.12-alpine

ARG BUILD_VERSION=dev
ARG BUILD_ARCH

WORKDIR /app
COPY server.py index.html styles.css app.js README.md /app/
COPY assets /app/assets
COPY run.sh /run.sh

RUN apk add --no-cache su-exec \
    && mkdir -p /data \
    && addgroup -S setlister \
    && adduser -S -G setlister setlister \
    && chown -R setlister:setlister /app /data \
    && chmod 0755 /run.sh

ENV SETLISTER_HOST=0.0.0.0 \
    SETLISTER_PORT=8110 \
    SETLISTER_DATA_DIR=/data

LABEL \
    io.hass.version="${BUILD_VERSION}" \
    io.hass.type="app" \
    io.hass.arch="${BUILD_ARCH}" \
    org.opencontainers.image.title="Setlister" \
    org.opencontainers.image.description="Kapelní repertoár a plánovač setlistů" \
    org.opencontainers.image.source="https://github.com/hanych420/setlister"

EXPOSE 8110
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8110/api/health || exit 1

CMD ["/run.sh"]
