FROM rust:1.83 AS builder
WORKDIR /build

# Cache dependencies
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && echo "" > src/lib.rs
RUN cargo build --release 2>/dev/null || true
RUN rm -rf src

# Build the actual application
COPY src ./src
RUN cargo build --release

# Runtime image
FROM debian:bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /build/target/release/api-proxy /app/api-proxy

# Create data directory for SQLite and keys
RUN mkdir -p /app/data

ENV DATABASE_PATH=/app/data/proxy.db
ENV MASTER_KEY_PATH=/app/data/master.key
ENV PROXY_PORT=8888
ENV MGMT_PORT=8889

EXPOSE 8888 8889

CMD ["/app/api-proxy"]
