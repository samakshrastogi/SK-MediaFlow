# SK-MediaFlow

`SK-MediaFlow` is a full-stack video platform for uploading, managing, organizing, and streaming video content. It includes media processing, AI-assisted metadata generation, profile and channel management, organization-scoped content, and admin workflows.

## Features

- Video upload with presigned S3 URLs
- Public, private, and organization-scoped videos
- S3 import workflows
- Video playback for landscape and portrait content
- AI-assisted title, description, keyword, and tag generation
- Spritesheet-based thumbnail selection
- User profiles, channels, playlists, favorites, and watch history
- Organization dashboards, membership flows, and admin controls
- Real-time upload and AI progress updates with Socket.IO

## Tech Stack

### Frontend

- React 19
- Vite 7
- TypeScript
- React Router 7
- Axios
- Socket.IO client
- Tailwind CSS 4

### Backend

- Node.js
- Express
- TypeScript
- Prisma ORM
- MongoDB
- BullMQ + Redis
- AWS S3 + CloudFront
- FFmpeg / ffprobe
- Google OAuth

### AI

- External AI server via `AI_SERVER_URL`
- Whisper-style transcription endpoint
- Ollama/LLM-style metadata generation endpoint

## Repository Structure

```text
SK-MediaFlow/
├── README.md
├── PROJECT_OVERVIEW.md
├── SETUP_GUIDE.md
├── SKILLS_DEVELOPED.md
├── WHISPER_OLLAMA_USAGE.md
├── backend/
└── frontend/
```

## Architecture Summary

### Frontend

The frontend handles:

- authentication flows
- home feed and hero content
- upload and S3 import UX
- video playback
- profile and video management
- search, favorites, playlists, and organization pages

Main frontend code lives in:

- `frontend/src/pages`
- `frontend/src/components`
- `frontend/src/layouts`
- `frontend/src/context`

### Backend

The backend handles:

- auth and session setup
- user and channel management
- upload completion and media orchestration
- spritesheet and thumbnail flows
- video listing and interaction APIs
- organization and admin APIs
- queue-backed background processing

Main backend code lives in:

- `backend/src/modules`
- `backend/src/services`
- `backend/src/workers`
- `backend/src/config`

## Processing Flow

1. Frontend uploads a video to S3 using a presigned URL.
2. Frontend calls backend upload completion.
3. Backend creates the video record.
4. Backend post-upload processing:
   - optimizes video streaming layout
   - generates a spritesheet
   - queues thumbnail generation if needed
   - queues AI processing
   - queues video metadata extraction
5. Workers process queued jobs.
6. Frontend receives progress updates through Socket.IO.

## Prerequisites

To run the project fully, you need:

- Node.js 18+
- npm
- MongoDB
- Redis
- FFmpeg and ffprobe in `PATH`
- AWS S3 bucket access
- CloudFront configuration
- Google OAuth credentials
- External AI server reachable from the backend

## Environment Variables

### Backend

Common required backend env categories:

- app: `PORT`, `JWT_SECRET`, `CLIENT_URL`
- database: `DATABASE_URL`
- AWS: `AWS_REGION`, `AWS_ACCESS_KEY`, `AWS_SECRET_KEY`, `AWS_BUCKET`
- CloudFront: `CLOUDFRONT_DOMAIN`, `CLOUDFRONT_KEY_PAIR_ID`, `CLOUDFRONT_PRIVATE_KEY`
- queues: `REDIS_URL`
- AI: `AI_SERVER_URL`
- OAuth: Google client credentials
- mail: SMTP/Brevo settings as needed

### Frontend

Required frontend env values:

```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
VITE_CLOUDFRONT_DOMAIN=<your-cloudfront-domain>
```

## Quick Start

### 1. Install dependencies

```powershell
cd backend
npm install

cd ..\frontend
npm install
```

### 2. Configure environment files

Create:

- `backend/.env`
- `frontend/.env`

### 3. Prepare database

```powershell
cd backend
npm run prisma:generate
npm run db:push
```

### 4. Start the backend API

```powershell
cd backend
npm run dev
```

### 5. Start backend workers

In another terminal:

```powershell
cd backend
npm run worker:dev
```

### 6. Start the frontend

In another terminal:

```powershell
cd frontend
npm run dev
```

## Build Commands

### Frontend

```powershell
cd frontend
npm run build
```

### Backend

```powershell
cd backend
npm run build
```

## Main Routes

### Frontend routes

- `/login`
- `/register`
- `/home`
- `/upload`
- `/s3-import`
- `/video/:publicId`
- `/portrait/:publicId`
- `/profile`
- `/playlists`
- `/favorites`
- `/search`
- `/organization`
- `/organization/dashboard`
- `/admin`

### Backend API prefixes

- `/api/auth`
- `/api/user`
- `/api/video`
- `/api/channel`
- `/api/ai`
- `/api/video-actions`
- `/api/organization`
- `/api/notification`
- `/api/admin`

## Important Notes

- Prisma is configured for MongoDB, not PostgreSQL.
- Background workers are required for AI, metadata, and thumbnail jobs.
- Spritesheet generation happens during post-upload processing.
- AI metadata generation depends on the external AI server.
- Signed CloudFront URLs are used for media delivery.

## Documentation

For more detail, use these project docs:

- [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)
- [SETUP_GUIDE.md](./SETUP_GUIDE.md)
- [WHISPER_OLLAMA_USAGE.md](./WHISPER_OLLAMA_USAGE.md)
- [SKILLS_DEVELOPED.md](./SKILLS_DEVELOPED.md)

## Status

This repository is set up as an actively evolving application. UI, media processing, and AI flows are under ongoing iteration, so the supporting documentation should be kept in sync with code changes.
