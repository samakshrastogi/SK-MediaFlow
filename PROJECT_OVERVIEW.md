# Project Overview: sk-cinema

## What This Project Is

`sk-cinema` is a full-stack video platform for uploading, organizing, streaming, and managing video content. It supports:

- Manual uploads and S3-based imports
- Public, private, and organization-scoped videos
- AI-assisted metadata generation
- Background processing for thumbnails, metadata, and AI jobs
- Profile and channel management
- Playlists, favorites, search, comments/reactions/history, and organization workflows

The codebase is split into:

- `backend/`: Express + TypeScript API, media processing, workers, queues, database access
- `frontend/`: React + Vite client app

---

## High-Level Architecture

### Frontend

- React 19
- Vite 7
- React Router 7
- Axios
- Socket.IO client
- Tailwind CSS 4

### Backend

- Node.js + TypeScript
- Express
- Prisma ORM
- MongoDB
- BullMQ + Redis
- AWS S3 + CloudFront signed URLs
- FFmpeg / ffprobe
- Socket.IO
- Google OAuth + JWT auth

### AI Pipeline

The AI workflow is not fully local inside this repository. The backend sends work to an external AI server defined by `AI_SERVER_URL`.

That AI server is expected to expose:

- `POST /transcribe` for Whisper-style transcription
- `POST /generate` for Ollama/LLM-style metadata generation

---

## Repository Structure

```text
sk-cinema/
├── PROJECT_OVERVIEW.md
├── SETUP_GUIDE.md
├── SKILLS_DEVELOPED.md
├── WHISPER_OLLAMA_USAGE.md
├── backend/
└── frontend/
```

---

## Backend Overview

The backend handles:

- authentication and session setup
- user and channel management
- video upload completion
- media processing orchestration
- S3 import flows
- organizations and admin flows
- notifications
- AI metadata retrieval and application

### Important Backend Entry Files

- `backend/src/app.ts`
  Sets up Express, CORS, sessions, Passport, routes, and worker imports.

- `backend/src/server.ts`
  Creates the HTTP server, attaches Socket.IO, and emits queue progress/completion events.

- `backend/prisma/schema.prisma`
  Defines the MongoDB data model used by Prisma.

### Backend Module Areas

- `backend/src/modules/auth/`
  Login, registration, Google OAuth, password reset, token flows.

- `backend/src/modules/user/`
  Profile updates, avatar/cover upload handling, user-level endpoints.

- `backend/src/modules/channel/`
  Channel creation and updates.

- `backend/src/modules/video/`
  Core video flows including upload completion, listing, playback lookup, S3 import, spritesheets, and thumbnail updates.

- `backend/src/modules/video/video-action.*`
  Video interactions such as reactions, comments, views, shares, favorites, and watch history flows.

- `backend/src/modules/organization/`
  Organization membership, policies, uploads, invitations, and dashboard logic.

- `backend/src/modules/admin/`
  Platform admin capabilities.

- `backend/src/modules/notification/`
  Notification endpoints.

- `backend/src/modules/ai/`
  Read/apply AI metadata already generated for videos.

### Backend Services and Processing

- `backend/src/modules/video/video-processing.service.ts`
  Main post-upload orchestration. Downloads the uploaded file, optimizes streaming layout, generates spritesheets, queues AI work, and queues metadata extraction.

- `backend/src/services/video-processing.service.ts`
  Queue helper utilities for thumbnail and metadata work.

- `backend/src/services/video-metadata.service.ts`
  Extracts technical metadata such as duration, dimensions, codecs, and orientation.

- `backend/src/services/thumbnail.service.ts`
  Generates thumbnails for videos when missing.

- `backend/src/services/realtime.service.ts`
  Emits real-time processing events used by the frontend.

### Queues and Workers

The project uses BullMQ with Redis.

Queues:

- `thumbnailQueue`
- `videoAIQueue`
- `videoMetadataQueue`

Workers:

- `backend/src/workers/thumbnail.worker.ts`
- `backend/src/workers/video-ai.worker.ts`
- `backend/src/workers/video-metadata.worker.ts`
- `backend/src/workers/index.ts`

These workers are required if you want background processing to run outside the main API process.

### Media Storage Flow

Videos and generated assets are stored in S3. The backend signs CloudFront URLs for secure playback and asset access.

Examples of generated assets:

- uploaded videos
- thumbnails
- spritesheets
- avatar/cover images

---

## Frontend Overview

The frontend is a protected single-page app for consuming and managing media.

### Important Frontend Entry Files

- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/layouts/MainLayout.tsx`
- `frontend/src/layouts/AppLayout.tsx`

### Main Frontend Pages

- `Auth.tsx`
  Login and registration.

- `Home.tsx`
  Hero carousel plus featured/public video rows.

- `Upload.tsx`
  Upload queue UI, AI progress handling, spritesheet thumbnail selection.

- `S3Import.tsx`
  Import videos from configured buckets.

- `VideoPlayer.tsx`
  Main player experience for landscape videos.

- `PortraitPlayer.tsx`
  Portrait video playback flow.

- `ProfilePage.tsx`
  Profile editing, upload management, video edit modal, thumbnail and spritesheet tools.

- `OrganizationPage.tsx`
  Organization entry and membership-related UI.

- `OrganizationDashboard.tsx`
  Organization management and content oversight.

- `AdminDashboard.tsx`
  Platform-level admin area.

- `PlaylistPage.tsx`
- `FavouritesPage.tsx`
- `Search.tsx`
- `ResetPassword.tsx`
- `OAuthSuccess.tsx`

### Shared Frontend Components

- `HeroCarousel.tsx`, `HeroCard.tsx`
- `VideoRow.tsx`, `VideoCard.tsx`
- `SpritesheetPicker.tsx`
- `Sidebar.tsx`, `Topbar.tsx`, `Navbar.tsx`, `MobileBottomNav.tsx`
- `UserAvatar.tsx`
- `AISuggestions.tsx`

### Frontend Data and Auth

- `frontend/src/api/axios.ts`
  Axios instance with auth token handling and `401` cleanup.

- `frontend/src/context/AuthContext.tsx`
  Authentication state and session handling.

- `frontend/src/utils/pageCache.ts`
  Small client-side page cache helper used in several pages.

---

## Runtime Requirements

To run the project fully, you need more than just `npm install`.

### Required Services

- MongoDB
- Redis
- AWS S3 bucket
- CloudFront distribution and signing keys
- FFmpeg and ffprobe available on the machine
- AI server reachable via `AI_SERVER_URL`

### Required Environment Areas

Backend:

- database connection
- JWT secret
- AWS credentials and bucket
- CloudFront settings
- Google OAuth settings
- Redis URL
- AI server URL
- email settings
- client URL

Frontend:

- `VITE_API_URL`
- `VITE_SOCKET_URL`
- `VITE_CLOUDFRONT_DOMAIN`

---

## Current Processing Flow

### Standard Upload Flow

1. Frontend uploads a video using a presigned S3 URL.
2. Frontend calls backend upload completion endpoint.
3. Backend creates the video record.
4. Backend runs `processVideoAfterUpload(...)`.
5. Backend:
   - downloads the video from S3
   - optimizes streaming layout
   - generates a spritesheet
   - queues AI processing
   - queues metadata extraction
   - queues thumbnail generation if needed
6. Workers process queued jobs.
7. Socket events update the frontend with AI progress and completion.

### Spritesheet Thumbnail Flow

1. Profile or upload UI requests `/api/video/upload/:videoId/spritesheet`.
2. Backend reads spritesheet metadata from S3.
3. Frontend shows `SpritesheetPicker`.
4. User selects a frame.
5. Backend crops the selected frame and stores a new thumbnail in S3.

---

## Key Notes for Maintainers

- Prisma is configured for MongoDB, not PostgreSQL.
- Worker processes matter for metadata, AI, and thumbnail jobs.
- Spritesheet generation currently happens during upload processing, not in a queue worker.
- AI output is stored in `videoAI` records and can be applied back onto the main `video` record.
- The frontend relies on both HTTP APIs and Socket.IO for a complete upload-processing UX.

---

## Summary

`sk-cinema` is a video platform with:

- modern React frontend
- Express/TypeScript backend
- MongoDB + Prisma
- Redis/BullMQ background jobs
- S3 + CloudFront media delivery
- FFmpeg-based media processing
- external AI server integration for transcription and metadata generation
- profile, organization, admin, and content-management workflows

Use `SETUP_GUIDE.md` for local setup, and `WHISPER_OLLAMA_USAGE.md` for the AI/transcription pipeline details.
