#!/bin/bash

set -euo pipefail

# 获取脚本所在目录（.zscripts）
# 使用 $0 获取脚本路径（与 build.sh 保持一致）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

log_step_start() {
	local step_name="$1"
	echo "=========================================="
	echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting: $step_name"
	echo "=========================================="
	export STEP_START_TIME
	STEP_START_TIME=$(date +%s)
}

log_step_end() {
	local step_name="${1:-Unknown step}"
	local end_time
	end_time=$(date +%s)
	local duration=$((end_time - STEP_START_TIME))
	echo "=========================================="
	echo "[$(date '+%Y-%m-%d %H:%M:%S')] Completed: $step_name"
	echo "[LOG] Step: $step_name | Duration: ${duration}s"
	echo "=========================================="
	echo ""
}

# NOTE: a start_mini_services() helper lived here. It scanned `mini-services/`
# and ran whatever it found. Those services had no authentication and bound to
# every interface; they were removed in favour of the authenticated /api/mcp.

wait_for_service() {
	local host="$1"
	local port="$2"
	local service_name="$3"
	local max_attempts="${4:-60}"
	local attempt=1

	echo "Waiting for $service_name to be ready on $host:$port..."

	while [ "$attempt" -le "$max_attempts" ]; do
		if curl -s --connect-timeout 2 --max-time 5 "http://$host:$port" >/dev/null 2>&1; then
			echo "$service_name is ready!"
			return 0
		fi

		echo "Attempt $attempt/$max_attempts: $service_name not ready yet, waiting..."
		sleep 1
		attempt=$((attempt + 1))
	done

	echo "ERROR: $service_name failed to start within $max_attempts seconds"
	return 1
}

cleanup() {
	if [ -n "${DEV_PID:-}" ] && kill -0 "$DEV_PID" >/dev/null 2>&1; then
		echo "Stopping Next.js dev server (PID: $DEV_PID)..."
		kill "$DEV_PID" >/dev/null 2>&1 || true
	fi
}

trap cleanup EXIT INT TERM

cd "$PROJECT_DIR"

if ! command -v bun >/dev/null 2>&1; then
	echo "ERROR: bun is not installed or not in PATH"
	exit 1
fi

log_step_start "bun install"
echo "[BUN] Installing dependencies..."
bun install
log_step_end "bun install"

log_step_start "bun run db:push"
echo "[BUN] Setting up database..."
bun run db:push
log_step_end "bun run db:push"

log_step_start "Starting Next.js dev server"
echo "[BUN] Starting development server..."
bun run dev &
DEV_PID=$!
log_step_end "Starting Next.js dev server"

log_step_start "Waiting for Next.js dev server"
wait_for_service "localhost" "3000" "Next.js dev server"
log_step_end "Waiting for Next.js dev server"

log_step_start "Health check"
echo "[BUN] Performing health check..."
curl -fsS localhost:3000 >/dev/null
echo "[BUN] Health check passed"
log_step_end "Health check"

echo "Next.js dev server is running in background (PID: $DEV_PID)."
echo "Use 'kill $DEV_PID' to stop it."
disown "$DEV_PID" 2>/dev/null || true
unset DEV_PID
