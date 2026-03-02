FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    jq \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY run-tests.sh ./
RUN chmod +x run-tests.sh

CMD ["./run-tests.sh"]
