# Makefile — PR Sentinel
# Common tasks for development, testing, and deployment

.PHONY: help dev build test lint validate clean deploy

# Default target
.DEFAULT_GOAL := help

# ============================================================================
# Configuration
# ============================================================================

BACKEND_DIR := backend
FRONTEND_DIR := frontend-chromeExtension
DOCKER_COMPOSE := docker-compose -f docker-compose.dev.yml
EXTENSION_ZIP := $(FRONTEND_DIR)/dist/pr-sentinel-extension.zip
MAX_EXTENSION_SIZE_MB := 20

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[0;33m
BLUE := \033[0;34m
NC := \033[0m  # No Color

# ============================================================================
# Help
# ============================================================================

help: ## Show this help message
	@echo "$(BLUE)PR Sentinel — Makefile Commands$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""

# ============================================================================
# Development
# ============================================================================

dev: ## Start development environment with Docker Compose
	@echo "$(BLUE)Starting development environment...$(NC)"
	$(DOCKER_COMPOSE) up --build

dev-detached: ## Start development environment in background
	@echo "$(BLUE)Starting development environment (detached)...$(NC)"
	$(DOCKER_COMPOSE) up --build -d
	@echo "$(GREEN)Services started. View logs with: make logs$(NC)"

logs: ## Tail Docker Compose logs
	$(DOCKER_COMPOSE) logs -f

stop: ## Stop development environment
	@echo "$(YELLOW)Stopping development environment...$(NC)"
	$(DOCKER_COMPOSE) down

restart: ## Restart development environment
	@echo "$(YELLOW)Restarting development environment...$(NC)"
	$(DOCKER_COMPOSE) restart

# ============================================================================
# Backend
# ============================================================================

backend-install: ## Install backend dependencies
	@echo "$(BLUE)Installing backend dependencies...$(NC)"
	cd $(BACKEND_DIR) && pip install -r requirements.txt

backend-test: ## Run backend tests
	@echo "$(BLUE)Running backend tests...$(NC)"
	cd $(BACKEND_DIR) && pytest --cov=app --cov-report=term --cov-report=html -v

backend-lint: ## Lint backend code
	@echo "$(BLUE)Linting backend code...$(NC)"
	cd $(BACKEND_DIR) && black --check app/
	cd $(BACKEND_DIR) && isort --check app/
	cd $(BACKEND_DIR) && flake8 app/
	cd $(BACKEND_DIR) && mypy app/core/ app/services/

backend-format: ## Format backend code
	@echo "$(BLUE)Formatting backend code...$(NC)"
	cd $(BACKEND_DIR) && black app/
	cd $(BACKEND_DIR) && isort app/

backend-seed: ## Seed database with admin/pro users
	@echo "$(BLUE)Seeding database...$(NC)"
	cd $(BACKEND_DIR) && python scripts/seed_users.py

backend-indexes: ## Create database indexes (including TTL)
	@echo "$(BLUE)Creating database indexes...$(NC)"
	cd $(BACKEND_DIR) && python scripts/create_indexes.py

backend-shell: ## Open Python shell with app context
	@echo "$(BLUE)Opening Python shell...$(NC)"
	cd $(BACKEND_DIR) && python -i -c "from app.main import create_app; app = create_app()"

# ============================================================================
# Frontend
# ============================================================================

frontend-install: ## Install frontend dependencies
	@echo "$(BLUE)Installing frontend dependencies...$(NC)"
	cd $(FRONTEND_DIR) && npm install

frontend-test: ## Run frontend tests
	@echo "$(BLUE)Running frontend tests...$(NC)"
	cd $(FRONTEND_DIR) && npm test -- --coverage

frontend-lint: ## Lint frontend code
	@echo "$(BLUE)Linting frontend code...$(NC)"
	cd $(FRONTEND_DIR) && npm run lint
	cd $(FRONTEND_DIR) && npm run typecheck

frontend-format: ## Format frontend code
	@echo "$(BLUE)Formatting frontend code...$(NC)"
	cd $(FRONTEND_DIR) && npm run format

frontend-build: ## Build Chrome extension for production
	@echo "$(BLUE)Building Chrome extension...$(NC)"
	cd $(FRONTEND_DIR) && npm run build:extension

frontend-zip: frontend-build ## Create extension ZIP for Chrome Web Store
	@echo "$(BLUE)Creating extension ZIP...$(NC)"
	cd $(FRONTEND_DIR) && npm run zip:extension
	@$(MAKE) extension-size-check

extension-size-check: ## Check extension ZIP size (must be < 20MB)
	@if [ -f $(EXTENSION_ZIP) ]; then \
		SIZE_MB=$$(du -m $(EXTENSION_ZIP) | cut -f1); \
		if [ $$SIZE_MB -lt $(MAX_EXTENSION_SIZE_MB) ]; then \
			echo "$(GREEN)✓ Extension size: $${SIZE_MB}MB (< $(MAX_EXTENSION_SIZE_MB)MB)$(NC)"; \
		else \
			echo "$(RED)✗ Extension size: $${SIZE_MB}MB (exceeds $(MAX_EXTENSION_SIZE_MB)MB limit)$(NC)"; \
			exit 1; \
		fi; \
	else \
		echo "$(RED)✗ Extension ZIP not found. Run 'make frontend-zip' first.$(NC)"; \
		exit 1; \
	fi

# ============================================================================
# Testing
# ============================================================================

test: backend-test frontend-test ## Run all tests (backend + frontend)

test-watch: ## Run tests in watch mode
	@echo "$(BLUE)Running tests in watch mode...$(NC)"
	@echo "Backend: run 'cd backend && pytest-watch' in another terminal"
	cd $(FRONTEND_DIR) && npm test -- --watch

# ============================================================================
# Linting & Formatting
# ============================================================================

lint: backend-lint frontend-lint ## Lint all code (backend + frontend)

format: backend-format frontend-format ## Format all code (backend + frontend)

# ============================================================================
# Validation (CI Pipeline)
# ============================================================================

validate: ## Run full validation pipeline (lint, typecheck, test, size check)
	@echo "$(BLUE)========================================$(NC)"
	@echo "$(BLUE)Running full validation pipeline...$(NC)"
	@echo "$(BLUE)========================================$(NC)"
	@echo ""
	@echo "$(YELLOW)[1/5] Backend linting...$(NC)"
	@$(MAKE) backend-lint
	@echo ""
	@echo "$(YELLOW)[2/5] Frontend linting...$(NC)"
	@$(MAKE) frontend-lint
	@echo ""
	@echo "$(YELLOW)[3/5] Backend tests...$(NC)"
	@$(MAKE) backend-test
	@echo ""
	@echo "$(YELLOW)[4/5] Frontend tests...$(NC)"
	@$(MAKE) frontend-test
	@echo ""
	@echo "$(YELLOW)[5/5] Extension size check...$(NC)"
	@$(MAKE) frontend-build
	@$(MAKE) extension-size-check
	@echo ""
	@echo "$(GREEN)========================================$(NC)"
	@echo "$(GREEN)✓ All validation checks passed!$(NC)"
	@echo "$(GREEN)========================================$(NC)"

# ============================================================================
# Docker Build
# ============================================================================

build: ## Build Docker images for production
	@echo "$(BLUE)Building Docker images...$(NC)"
	docker build -t pr-sentinel-backend:latest ./$(BACKEND_DIR)
	docker build -t pr-sentinel-frontend:latest ./$(FRONTEND_DIR)

# ============================================================================
# Azure Deployment
# ============================================================================

deploy-acr: ## Build and push to Azure Container Registry
	@echo "$(BLUE)Deploying to Azure Container Registry...$(NC)"
	@if [ -z "$$ACR_NAME" ]; then \
		echo "$(RED)Error: ACR_NAME environment variable not set$(NC)"; \
		exit 1; \
	fi
	az acr build \
		--registry $$ACR_NAME \
		--image pr-sentinel-backend:latest \
		--file $(BACKEND_DIR)/Dockerfile \
		$(BACKEND_DIR)/
	@echo "$(GREEN)✓ Image pushed to $$ACR_NAME.azurecr.io/pr-sentinel-backend:latest$(NC)"

deploy-app-service: ## Deploy to Azure App Service (requires ACR_NAME, RESOURCE_GROUP, APP_NAME)
	@echo "$(BLUE)Deploying to Azure App Service...$(NC)"
	@if [ -z "$$ACR_NAME" ] || [ -z "$$RESOURCE_GROUP" ] || [ -z "$$APP_NAME" ]; then \
		echo "$(RED)Error: Set ACR_NAME, RESOURCE_GROUP, APP_NAME environment variables$(NC)"; \
		exit 1; \
	fi
	az webapp config container set \
		--name $$APP_NAME \
		--resource-group $$RESOURCE_GROUP \
		--docker-custom-image-name $$ACR_NAME.azurecr.io/pr-sentinel-backend:latest
	az webapp restart \
		--name $$APP_NAME \
		--resource-group $$RESOURCE_GROUP
	@echo "$(GREEN)✓ Deployed to $$APP_NAME.azurewebsites.net$(NC)"

# ============================================================================
# Cleanup
# ============================================================================

clean: ## Remove build artifacts and caches
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "htmlcov" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type f -name ".coverage" -delete 2>/dev/null || true
	rm -rf $(FRONTEND_DIR)/dist 2>/dev/null || true
	rm -rf $(FRONTEND_DIR)/coverage 2>/dev/null || true
	rm -rf $(FRONTEND_DIR)/node_modules/.cache 2>/dev/null || true
	rm -f $(EXTENSION_ZIP) 2>/dev/null || true
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

clean-all: clean ## Remove all generated files including node_modules and venv
	@echo "$(YELLOW)Removing all generated files...$(NC)"
	rm -rf $(FRONTEND_DIR)/node_modules 2>/dev/null || true
	rm -rf $(BACKEND_DIR)/venv 2>/dev/null || true
	$(DOCKER_COMPOSE) down -v  # Remove Docker volumes
	@echo "$(GREEN)✓ Full cleanup complete$(NC)"

# ============================================================================
# Pre-commit
# ============================================================================

pre-commit-install: ## Install pre-commit hooks
	@echo "$(BLUE)Installing pre-commit hooks...$(NC)"
	pip install pre-commit
	pre-commit install
	@echo "$(GREEN)✓ Pre-commit hooks installed$(NC)"

pre-commit-run: ## Run pre-commit hooks on all files
	@echo "$(BLUE)Running pre-commit hooks...$(NC)"
	pre-commit run --all-files

# ============================================================================
# Database
# ============================================================================

db-shell: ## Open MongoDB shell
	@echo "$(BLUE)Opening MongoDB shell...$(NC)"
	docker exec -it pr-sentinel-mongo mongosh -u admin -p admin123

db-backup: ## Backup MongoDB database
	@echo "$(BLUE)Backing up database...$(NC)"
	docker exec pr-sentinel-mongo mongodump --out /tmp/backup
	docker cp pr-sentinel-mongo:/tmp/backup ./backup
	@echo "$(GREEN)✓ Database backed up to ./backup$(NC)"

db-restore: ## Restore MongoDB database from backup
	@echo "$(YELLOW)Restoring database from ./backup...$(NC)"
	docker cp ./backup pr-sentinel-mongo:/tmp/backup
	docker exec pr-sentinel-mongo mongorestore /tmp/backup
	@echo "$(GREEN)✓ Database restored$(NC)"

# ============================================================================
# Utilities
# ============================================================================

install: backend-install frontend-install ## Install all dependencies

setup: install pre-commit-install backend-indexes backend-seed ## Complete setup (install deps, hooks, seed DB)
	@echo ""
	@echo "$(GREEN)========================================$(NC)"
	@echo "$(GREEN)✓ Setup complete!$(NC)"
	@echo "$(GREEN)========================================$(NC)"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Copy .env.example to .env and fill in your credentials"
	@echo "  2. Run 'make dev' to start the development environment"
	@echo "  3. Load extension in Chrome from $(FRONTEND_DIR)/dist"
	@echo ""

status: ## Show status of Docker services
	$(DOCKER_COMPOSE) ps

health: ## Check health of all services
	@echo "$(BLUE)Checking service health...$(NC)"
	@curl -f http://localhost:8000/health/live && echo "$(GREEN)✓ Backend: healthy$(NC)" || echo "$(RED)✗ Backend: unhealthy$(NC)"
	@curl -f http://localhost:5173 && echo "$(GREEN)✓ Frontend: healthy$(NC)" || echo "$(RED)✗ Frontend: unhealthy$(NC)"
