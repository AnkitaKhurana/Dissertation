# PR Sentinel Backend — Multi-Stage Dockerfile
# Build optimized Docker image for production with health checks and non-root user

# ============================================================================
# Stage 1: Base
# ============================================================================
FROM python:3.11-slim as base

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Set working directory
WORKDIR /app

# ============================================================================
# Stage 2: Dependencies
# ============================================================================
FROM base as dependencies

# Copy requirements first for better layer caching
COPY requirements.txt /app/

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# ============================================================================
# Stage 3: Development
# ============================================================================
FROM dependencies as development

# Copy application code
COPY . /app/

# Change ownership to non-root user
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health/live || exit 1

# Run application with auto-reload (development)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ============================================================================
# Stage 4: Production
# ============================================================================
FROM dependencies as production

# Copy application code only (exclude tests, docs)
COPY app/ /app/app/
COPY scripts/ /app/scripts/

# Change ownership to non-root user
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health/live || exit 1

# Run application (production)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]

# ============================================================================
# Build Instructions
# ============================================================================

# Development:
#   docker build --target development -t pr-sentinel-backend:dev .
#   docker run -p 8000:8000 --env-file .env pr-sentinel-backend:dev

# Production:
#   docker build --target production -t pr-sentinel-backend:latest .
#   docker run -p 8000:8000 --env-file .env pr-sentinel-backend:latest

# Azure ACR:
#   az acr build --registry $ACR_NAME --image pr-sentinel-backend:latest --file Dockerfile .

# Resource Limits (Recommended):
#   docker run -p 8000:8000 \
#     --cpus="2" \
#     --memory="4g" \
#     --env-file .env \
#     pr-sentinel-backend:latest
