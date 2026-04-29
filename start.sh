#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  Voxara — startup / rebuild script
#
#  Usage:
#    ./start.sh              Start (or restart) all services
#    ./start.sh --build      Rebuild images then start
#    ./start.sh --stop       Stop all containers
#    ./start.sh --restart    Restart containers without rebuilding
#    ./start.sh --logs       Tail live logs from all containers
#    ./start.sh --status     Show container status
#    ./start.sh --ngrok      Show detected ngrok URL only
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Paths ────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT/backend/.env"
# Use an array so spaces in $ROOT don't cause word-splitting
COMPOSE=(docker compose -f "$ROOT/docker-compose.yml")

# ── Colours ─────────────────────────────────────────────────────
G='\033[0;32m'; C='\033[0;36m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[1;34m'; NC='\033[0m'
info()    { echo -e "${C}[voxara]${NC} $1"; }
success() { echo -e "${G}[voxara]${NC} $1"; }
warn()    { echo -e "${Y}[voxara]${NC} $1"; }
error()   { echo -e "${R}[voxara]${NC} $1"; exit 1; }
step()    { echo -e "${B}  ──${NC} $1"; }

# ── Helpers ──────────────────────────────────────────────────────

# Read a value from the .env file
env_get() {
  grep -m1 "^${1}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || true
}

# Write / update a key=value line in the .env file (in-place, preserves comments)
env_set() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

# Query the local ngrok agent API and return the first HTTPS public URL
detect_ngrok_url() {
  local raw
  raw=$(curl -sf --max-time 3 http://localhost:4040/api/tunnels 2>/dev/null) || return 0
  # Extract first https URL — works with python3 (always available on the host)
  echo "$raw" | python3 -c \
    "import json,sys
data=json.load(sys.stdin)
urls=[t['public_url'] for t in data.get('tunnels',[]) if t['public_url'].startswith('https')]
print(urls[0] if urls else '')" 2>/dev/null || true
}

# Free a port if something else is using it
free_port() {
  local port="$1"
  local pid
  pid=$(lsof -ti:"$port" 2>/dev/null || true)
  if [[ -n "$pid" ]]; then
    warn "Port $port is busy — killing PID $pid"
    kill -9 "$pid" 2>/dev/null || true
  fi
}

# ── Ngrok detection + .env patching ──────────────────────────────
check_ngrok() {
  step "Checking ngrok tunnel…"
  local url
  url=$(detect_ngrok_url)

  if [[ -z "$url" ]]; then
    # Try to auto-start ngrok if it is installed
    if command -v ngrok &>/dev/null; then
      warn "ngrok not running — starting it automatically on port 8001…"
      nohup ngrok http 8001 --log=stdout > /tmp/ngrok.log 2>&1 &
      step "Waiting for ngrok to initialize (up to 20s)…"
      local waited=0
      while [[ $waited -lt 20 ]]; do
        sleep 1
        url=$(detect_ngrok_url)
        [[ -n "$url" ]] && break
        ((waited++)) || true
      done
      if [[ -z "$url" ]]; then
        warn "ngrok failed to start after 20s — check /tmp/ngrok.log"
        warn "Twilio webhooks will NOT work without a public URL."
        # Reset BASE_URL to local so the stale old ngrok URL is not used
        env_set "NGROK_URL" ""
        env_set "BASE_URL" "http://localhost:8001"
        return
      fi
      success "ngrok started automatically."
    else
      warn "ngrok not found (not installed or not in PATH)."
      warn "Install from https://ngrok.com/download then re-run ./start.sh"
      warn "Resetting BASE_URL to localhost — Twilio webhooks will NOT work."
      # Clear stale ngrok URL so the backend doesn't use an expired tunnel
      env_set "NGROK_URL" ""
      env_set "BASE_URL" "http://localhost:8001"
      return
    fi
  fi

  local current
  current=$(env_get "NGROK_URL")

  if [[ "$url" == "$current" ]]; then
    success "ngrok URL unchanged → ${url}"
  else
    env_set "NGROK_URL" "$url"
    success "ngrok URL updated  → ${url}"
    # Also update BASE_URL so local tools (alembic, etc.) use the same URL
    env_set "BASE_URL" "$url"
  fi
}

# ── Docker image freshness check ─────────────────────────────────
# Returns 0 (true) if the given service image is older than its source files
needs_rebuild() {
  local service="$1"
  local src_dir="$ROOT/$service"

  # If image doesn't exist yet → definitely needs build
  local img_created
  img_created=$(docker inspect "aivoiceagentelevenlab-${service}" \
    --format '{{.Created}}' 2>/dev/null) || { return 0; }

  local img_ts
  img_ts=$(date -d "$img_created" +%s 2>/dev/null || \
           date -j -f "%Y-%m-%dT%H:%M:%S" "${img_created%%.*}" +%s 2>/dev/null || echo 0)

  # Find newest source file (exclude build artefacts)
  local newest_src
  newest_src=$(find "$src_dir" \
    -not \( -path "*/node_modules/*" -o -path "*/.next/*" -o -path "*/.venv/*" \
            -o -path "*/__pycache__/*" -o -name "*.pyc" \) \
    -newer <(date -d "@$img_ts" 2>/dev/null || date -r "$img_ts" 2>/dev/null) \
    -print -quit 2>/dev/null) || true

  [[ -n "$newest_src" ]]
}

# ── Core actions ─────────────────────────────────────────────────

do_stop() {
  info "Stopping all containers…"
  "${COMPOSE[@]}" down
  success "All containers stopped."
}

do_logs() {
  "${COMPOSE[@]}" logs -f --tail=150
}

do_status() {
  "${COMPOSE[@]}" ps
}

do_ngrok_only() {
  check_ngrok
}

do_restart() {
  info "Restarting containers (no rebuild)…"
  check_ngrok
  "${COMPOSE[@]}" restart
  success "Restarted."
}

do_start() {
  local force_build="${1:-}"
  echo ""
  echo -e "${B}╔══════════════════════════════════╗${NC}"
  echo -e "${B}║       Voxara — Starting Up       ║${NC}"
  echo -e "${B}╚══════════════════════════════════╝${NC}"
  echo ""

  # 1. Detect ngrok and patch .env
  check_ngrok

  # 2. Decide whether to rebuild
  local build_backend=false
  local build_frontend=false

  if [[ "$force_build" == "--build" ]]; then
    build_backend=true
    build_frontend=true
    step "Forced rebuild requested."
  else
    if needs_rebuild "backend"; then
      build_backend=true
      step "Backend source changed — will rebuild."
    fi
    if needs_rebuild "frontend"; then
      build_frontend=true
      step "Frontend source changed — will rebuild."
    fi
  fi

  # 3. Build services that need it
  if $build_backend || $build_frontend; then
    step "Building Docker images…"
    local services=()
    $build_backend  && services+=("backend")
    $build_frontend && services+=("frontend")

    DOCKER_BUILDKIT=1 "${COMPOSE[@]}" build "${services[@]}"
    success "Build complete."
  else
    step "Images are up-to-date — skipping build."
  fi

  # 4. Free host ports before starting
  for port in 8001 3742; do free_port "$port"; done

  # 5. Tear down old containers and bring everything up
  step "Stopping old containers…"
  "${COMPOSE[@]}" down 2>/dev/null || true

  step "Starting all services…"
  "${COMPOSE[@]}" up -d

  # 6. Show status
  echo ""
  "${COMPOSE[@]}" ps
  echo ""
  echo -e "${G}╔═══════════════════════════════════════════════════╗${NC}"
  echo -e "${G}║              All services are running             ║${NC}"
  echo -e "${G}╚═══════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${C}Frontend${NC}   → http://localhost:3742"
  echo -e "  ${C}Backend ${NC}   → http://localhost:8001"
  echo -e "  ${C}API Docs${NC}   → http://localhost:8001/docs"
  echo -e "  ${C}Postgres${NC}   → localhost:5434  (voxara / voxara_dev)"
  echo -e "  ${C}Redis   ${NC}   → localhost:6382"

  local ngrok_url
  ngrok_url=$(env_get "NGROK_URL")
  if [[ -n "$ngrok_url" ]]; then
    echo ""
    echo -e "  ${Y}Twilio URL${NC} → ${ngrok_url} (ngrok active)"
  fi

  echo ""
  echo -e "  Tail logs:   ${Y}./start.sh --logs${NC}"
  echo -e "  Stop all:    ${Y}./start.sh --stop${NC}"
  echo -e "  Force build: ${Y}./start.sh --build${NC}"
  echo ""
}

# ── Entry point ──────────────────────────────────────────────────
case "${1:-}" in
  --stop)    do_stop ;;
  --logs)    do_logs ;;
  --status)  do_status ;;
  --restart) do_restart ;;
  --ngrok)   do_ngrok_only ;;
  --build)   do_start --build ;;
  "")        do_start ;;
  *) error "Unknown option: $1  (use --build | --stop | --restart | --logs | --status | --ngrok)" ;;
esac
