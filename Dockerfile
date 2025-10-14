# Multi-stage Dockerfile for RPG Music Streaming Server
# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install frontend dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN npm run build

# Stage 2: Build backend and final image
FROM node:22-alpine AS production

WORKDIR /app

# Install required system dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite

# Copy backend package files
COPY backend/package*.json ./

# Install backend dependencies
RUN npm ci --only=production

# Copy backend source
COPY backend/ ./

# Copy built frontend from frontend-builder stage to backend's public directory
COPY --from=frontend-builder /app/frontend/dist ./public

# Create directories for data and music
RUN mkdir -p /app/data /app/music

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV MUSIC_DIR=/app/music
ENV DB_PATH=/app/data/rpg-music.db
ENV LOG_LEVEL=info

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run database migration on startup and then start the server
CMD ["sh", "-c", "node src/db/migrate.js && node src/server.js"]
