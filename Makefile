.PHONY: install install-backend install-frontend dev dev-backend dev-frontend clean

install: install-backend install-frontend

install-backend:
	cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt

install-frontend:
	cd frontend && npm install

dev-backend:
	cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend:
	cd frontend && npm run dev -- --host

# Run both (requires two terminals — or use tmux/foreman)
dev:
	@echo "Open two terminals and run:"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"

clean:
	rm -rf backend/.venv backend/uploads backend/cache
	rm -rf frontend/node_modules frontend/dist
