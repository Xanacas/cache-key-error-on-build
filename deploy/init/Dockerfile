FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /init
COPY init.sh seed.sql ./
RUN chmod +x init.sh

CMD ["./init.sh"]
