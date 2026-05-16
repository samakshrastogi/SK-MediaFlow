# SKFlix Setup Guide

## What You Need

Before starting the project, make sure these are available on your machine:

- Node.js 18+
- npm
- MongoDB
- Redis
- FFmpeg and ffprobe in `PATH`
- AWS S3 bucket access
- CloudFront signing configuration
- Google OAuth credentials
- An AI server reachable from the backend

This project is not fully self-contained. Upload processing and AI features depend on external services.

---

## Project Structure

```text
SKFlix/
├── backend/
└── frontend/
```

---

## 1. Clone and Install

```powershell
git clone <repo-url>
cd SKFlix
```

### Backend dependencies

```powershell
cd backend
npm install
```

### Frontend dependencies

```powershell
cd ..\frontend
npm install
```

---

## 2. Backend Configuration

Create `backend/.env`.

The backend currently expects values in these categories:

### Core

- `PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `CLIENT_URL`

### AWS / Media

- `AWS_REGION`
- `AWS_ACCESS_KEY`
- `AWS_SECRET_KEY`
- `AWS_BUCKET`
- `CLOUDFRONT_DOMAIN`
- `CLOUDFRONT_KEY_PAIR_ID`
- `CLOUDFRONT_PRIVATE_KEY`

### Redis / Jobs

- `REDIS_URL`

### OAuth

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`

### AI / Transcription

- `AI_SERVER_URL`

### Email

- `EMAIL_FROM`
- `EMAIL_REPLY_TO`
- optionally SMTP/Brevo credentials used by your auth and notification flows

### Other

- `OPENAI_API_KEY`
- `CREDENTIAL_SECRET`

Important notes:

- Prisma is configured for MongoDB.
- `CLIENT_URL` should point to your frontend dev server, typically `http://localhost:5173`.
- `AI_SERVER_URL` must expose the transcription and generation endpoints used by the AI worker.

---

## 3. Frontend Configuration

Create `frontend/.env`.

Required variables:

```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
VITE_CLOUDFRONT_DOMAIN=<your-cloudfront-domain>
```

Notes:

- `VITE_API_URL` should include `/api`.
- `VITE_SOCKET_URL` should point to the backend server root.
- `VITE_CLOUDFRONT_DOMAIN` is used to render signed media asset URLs.

---

## 4. Database Setup

This project uses Prisma with MongoDB.

Generate the Prisma client:

```powershell
cd backend
npm run prisma:generate
```

Push the schema to MongoDB:

```powershell
npm run db:push
```

Useful optional command:

```powershell
npx prisma studio
```

---

## 5. Required Supporting Services

### MongoDB

Make sure your MongoDB instance is reachable from `DATABASE_URL`.

### Redis

BullMQ depends on Redis for:

- thumbnail jobs
- video AI jobs
- video metadata jobs

If Redis is down, queued processing will fail.

### FFmpeg

These commands must work in your shell:

```powershell
ffmpeg -version
ffprobe -version
```

FFmpeg is required for:

- audio extraction
- spritesheet generation
- thumbnail generation
- video optimization
- metadata extraction support

### AI Server

The backend AI worker calls:

- `POST {AI_SERVER_URL}/transcribe`
- `POST {AI_SERVER_URL}/generate`

That service is expected to handle:

- transcription
- metadata generation from transcript text

---

## 6. Running the Project

### Backend API

```powershell
cd backend
npm run dev
```

### Backend workers

In another terminal:

```powershell
cd backend
npm run worker:dev
```

This starts:

- thumbnail worker
- video AI worker
- video metadata worker

### Frontend

In another terminal:

```powershell
cd frontend
npm run dev
```

---

## 7. Production Builds

### Backend

```powershell
cd backend
npm run build
npm run start
```

### Workers

```powershell
cd backend
npm run build
npm run worker
```

### Frontend

```powershell
cd frontend
npm run build
npm run preview
```

---

## 8. Typical Local Dev URLs

- Frontend: `http://localhost:5173`
- Backend API root: `http://localhost:5000`
- Backend API base: `http://localhost:5000/api`
- Socket.IO server: `http://localhost:5000`

---

## 9. Common Workflows

### Standard upload workflow

1. Start backend API.
2. Start backend workers.
3. Start frontend.
4. Upload a video from the frontend.
5. Wait for:
   - upload completion
   - thumbnail generation
   - video metadata extraction
   - AI processing
   - spritesheet availability

### S3 import workflow

1. Configure S3 credentials in backend env.
2. Use the frontend `S3 Import` page.
3. Import videos into the application.
4. Let backend post-processing run.

---

## 10. Troubleshooting

### Upload succeeds but AI metadata never appears

Check:

- backend API is running
- worker process is running
- Redis is reachable
- `AI_SERVER_URL` is reachable

### Spritesheet does not appear

Check:

- FFmpeg / ffprobe are installed
- backend upload processing ran successfully
- S3 contains:
  - `.../spritesheets/<videoId>/sheet.webp`
  - `.../spritesheets/<videoId>/meta.json`

### Videos do not play

Check:

- CloudFront settings
- signed URL generation
- `VITE_CLOUDFRONT_DOMAIN`

### Auth issues

Check:

- JWT secret
- frontend token storage
- Google OAuth env values
- `CLIENT_URL` and callback URL alignment

### Queue issues

Check:

- Redis availability
- worker process
- backend console logs

---

## 11. Recommended Startup Order

1. MongoDB
2. Redis
3. Backend API
4. Backend workers
5. Frontend

---

## 12. Quick Commands

### Backend

```powershell
npm run dev
npm run worker:dev
npm run prisma:generate
npm run db:push
npm run build
```

### Frontend

```powershell
npm run dev
npm run build
npm run preview
```

---

## Summary

For the project to work fully, you need:

- backend API
- backend workers
- MongoDB
- Redis
- FFmpeg
- S3/CloudFront config
- AI server
- frontend env config

If one of those pieces is missing, the app may still boot, but media processing or AI features will be incomplete.
