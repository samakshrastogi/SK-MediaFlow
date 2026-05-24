# SK-MediaFlow

`SK-MediaFlow` is a full-stack video platform for publishing, organizing, streaming, and managing media at individual, organization, and platform-admin levels. The current codebase combines creator workflows, AI-assisted metadata, S3-backed ingestion, background processing, and analytics-oriented administration in a single product surface.

## What The Project Currently Includes

- Email/password authentication with OTP verification, password reset, and Google OAuth
- User profiles with avatar and cover management
- Channel-based publishing
- Direct video uploads with presigned S3 URLs
- S3 bucket registration, scanning, and selective import
- Public, private, and organization-scoped video visibility
- Landscape and portrait playback flows
- AI-generated transcript, title, description, keywords, and tags
- Spritesheet generation and frame-based thumbnail selection
- Reactions, comments, shares, favorites, playlists, and watch history
- Organization creation, join flows, invite flows, uploader policy controls, and dashboard metrics
- Platform admin analytics, subscription visibility, and admin access management
- Real-time processing updates through Socket.IO

## Architecture

### Frontend

- React 19
- TypeScript
- Vite 7
- React Router 7
- Axios
- Socket.IO client
- Tailwind CSS 4
- Framer Motion

### Backend

- Node.js
- Express
- TypeScript
- Prisma ORM
- MongoDB
- BullMQ with Redis
- AWS S3
- CloudFront signed delivery
- FFmpeg and ffprobe
- Passport Google OAuth
- JWT-based auth flows

### AI And Processing

- External AI service integration through backend AI modules
- Queue-backed workers for thumbnailing, AI enrichment, and technical metadata extraction
- Post-upload media orchestration for optimization, spritesheets, and downstream jobs

## Project Flowchart

```mermaid
flowchart TD
    U["User"] --> F["Frontend App<br/>React 19 + Vite"]

    subgraph FE["Frontend Surface"]
        F --> FE1["Auth Pages<br/>Login, Register, OAuth Success, Reset Password"]
        F --> FE2["Discovery And Playback<br/>Home, Video Player, Portrait Player, Search"]
        F --> FE3["Creator Tools<br/>Upload, S3 Import, Profile, Thumbnail Picker"]
        F --> FE4["Workspace Areas<br/>Favorites, Playlists, Settings"]
        F --> FE5["Governance Areas<br/>Organization, Organization Dashboard, Admin"]
    end

    F --> AX["Axios Client"]
    F --> SO["Socket.IO Client"]

    AX --> API["Backend API<br/>Express + TypeScript"]
    SO --> RT["Realtime Service<br/>Socket.IO Server"]

    subgraph BE["Backend Modules"]
        API --> M1["Auth Module<br/>Register, OTP, Login, Google OAuth, Reset Password"]
        API --> M2["User Module<br/>Profile, Settings, Sessions, Avatar, Cover"]
        API --> M3["Channel Module<br/>Creator Channel Management"]
        API --> M4["Video Module<br/>Upload, Search, Playback, S3 Import, Spritesheets"]
        API --> M5["Video Actions Module<br/>Views, Likes, Dislikes, Comments, Shares, Playlists"]
        API --> M6["AI Module<br/>Generate And Apply AI Suggestions"]
        API --> M7["Organization Module<br/>Memberships, Invites, Policies, Billing, Dashboard"]
        API --> M8["Notification Module<br/>User Notifications"]
        API --> M9["Admin Module<br/>Metrics, Filters, Admin Access Control"]
    end

    API --> PR["Prisma ORM"]
    PR --> DB["MongoDB"]

    M4 --> S3["AWS S3 Storage"]
    M2 --> S3
    M4 --> CF["CloudFront Signed Delivery"]
    M2 --> CF

    M4 --> ORCH["Post-Upload Orchestration"]
    ORCH --> FFM["FFmpeg / ffprobe Processing"]
    ORCH --> SPR["Spritesheet Generation"]
    ORCH --> Q["BullMQ Queues"]

    Q --> REDIS["Redis"]
    Q --> W1["Thumbnail Worker"]
    Q --> W2["Video AI Worker"]
    Q --> W3["Video Metadata Worker"]

    W1 --> S3
    W1 --> DB
    W2 --> AI["External AI Service"]
    AI --> W2
    W2 --> DB
    W3 --> DB

    ORCH --> RT
    W1 --> RT
    W2 --> RT
    W3 --> RT
    RT --> SO

    CF --> FE2
    CF --> FE3
```

## Detailed Flowcharts

### Authentication flow

```mermaid
flowchart TD
    U["Visitor"] --> A1["Frontend Auth Pages"]

    A1 --> R1["Register"]
    R1 --> API1["Create Account Request"]
    API1 --> DB["User Record Created In MongoDB"]
    API1 --> OTP["OTP Generated And Sent"]
    OTP --> V1["Verify OTP"]
    V1 --> DB
    DB --> READY["Verified Account Ready For Login"]

    A1 --> L1["Login"]
    L1 --> API2["Login Request"]
    API2 --> AUTH["Validate Password / Provider State"]
    AUTH --> LOGINREC["Create UserLogin Session Record"]
    LOGINREC --> JWT["Issue JWT Token"]
    JWT --> FE["Token Stored In Frontend Auth Context"]

    A1 --> G1["Google Sign-In"]
    G1 --> GAPI["Start Google OAuth"]
    GAPI --> GOOGLE["Google OAuth Consent"]
    GOOGLE --> GCALL["OAuth Callback"]
    GCALL --> PROFILE["Find Or Create User + Channel Context"]
    PROFILE --> GLOGIN["Create UserLogin Session Record"]
    GLOGIN --> GJWT["Issue JWT And Redirect To /oauth-success"]
    GJWT --> FE

    A1 --> FP["Forgot Password"]
    FP --> FPAPI["Request Password Reset"]
    FPAPI --> MAIL["Reset Link Delivery"]
    MAIL --> RESET["Submit New Password"]
    RESET --> DB

    FE --> END["End Session"]
    END --> DB
```

### User settings and security flow

```mermaid
flowchart TD
    U["Authenticated User"] --> SET["Settings Page"]
    SET --> LOAD["Load Current Settings"]
    LOAD --> DB["User + UserLogin + Preferences Data"]
    DB --> SET

    SET --> PREF["Save Preferences"]
    PREF --> SAVE1["Save Notification, Privacy, Preference Flags"]
    SAVE1 --> DB

    SET --> EMAIL["Update Email"]
    EMAIL --> CHECKPW1["Validate Current Password If Required"]
    CHECKPW1 --> UPDATEEMAIL["Update Email, Reset Verification State"]
    UPDATEEMAIL --> REVOKE1["Revoke Sessions"]
    REVOKE1 --> OTP["Send Verification OTP"]
    OTP --> DB

    SET --> PASS["Update Password"]
    PASS --> CHECKPW2["Validate Current Password"]
    CHECKPW2 --> HASH["Hash New Password"]
    HASH --> SAVE2["Persist New Password"]
    SAVE2 --> REVOKE2["Revoke Other Sessions"]
    REVOKE2 --> DB

    SET --> SESS1["Revoke Other Sessions"]
    SESS1 --> DB

    SET --> SESS2["Remove Individual Session"]
    SESS2 --> DB

    SET --> HIST["Clear Watch History"]
    HIST --> CLEAR["Clear WatchHistory"]
    CLEAR --> DB

    SET --> DEACT["Deactivate Account"]
    DEACT --> DEACTSAVE["Mark deactivatedAt + Revoke Sessions"]
    DEACTSAVE --> DB

    SET --> DEL["Delete Account"]
    DEL --> CONF["Require DELETE Confirmation"]
    CONF --> ANON["Anonymize User Fields + Mark deletedAt"]
    ANON --> DB
```

### Profile and media management flow

```mermaid
flowchart LR
    U["Authenticated Creator"] --> PROF["Profile Page"]
    PROF --> ME["Load Profile Workspace"]
    ME --> DB["Load User, Channel, Stats, Uploaded Videos, History, Favorites, Playlists"]
    DB --> PROF

    PROF --> AV1["Request Avatar Upload URL"]
    AV1 --> S3A["Presigned S3 Target"]
    S3A --> AV2["Upload Avatar To S3"]
    AV2 --> AV3["Save Avatar Key In User Record"]
    AV3 --> CF["CloudFront Signed URL Returned"]

    PROF --> CV1["Request Cover Upload URL"]
    CV1 --> S3C["Presigned Cover Upload Target"]
    S3C --> CV2["Upload Cover To S3"]
    CV2 --> CV3["Save Cover Selection"]
    CV3 --> DB2["Save coverKey"]
    DB2 --> CF

    PROF --> VIDEOS["Owned Video Management"]
    VIDEOS --> EDIT["Edit Video Details"]
    VIDEOS --> DEL["Delete Video"]
    EDIT --> DB3["Update Metadata, Visibility, Ownership Fields"]
    DEL --> DB4["Soft Delete / Status Update"]
```

### S3 import flow

```mermaid
flowchart TD
    U["Authenticated User"] --> IMP["S3 Import Page"]
    IMP --> CREDS["Register External Bucket"]
    CREDS --> DB["Store User S3 Credential Record"]

    IMP --> LIST["Load Registered Buckets"]
    LIST --> DB
    DB --> IMP

    IMP --> SCAN["Scan Bucket Contents"]
    SCAN --> S3["External Bucket Listing"]
    S3 --> FILES["Return Candidate Media Files"]
    FILES --> IMP

    IMP --> PICK["Select Videos To Import"]
    PICK --> IMPORT["Start Import"]
    IMPORT --> VIDEO["Create Video Records With uploadSource = S3_IMPORT"]
    VIDEO --> DB2["Persist Imported Video Entries"]
    VIDEO --> ORCH["Start Standard Post-Upload Orchestration"]
    ORCH --> JOBS["Spritesheet + Metadata + Thumbnail + AI Jobs"]
```

### Playback access flow

```mermaid
flowchart TD
    U["Viewer"] --> PAGE["Video Player Or Portrait Player"]
    PAGE --> FETCH["Load Playback Data"]
    FETCH --> AUTH["Authenticate User"]
    AUTH --> LOOKUP["Load Video + Channel + AI + Metadata"]
    LOOKUP --> VIS["Evaluate Visibility Rules"]

    VIS --> PUB["PUBLIC"]
    VIS --> PRI["PRIVATE"]
    VIS --> ORG["ORGANIZATION"]

    PUB --> SIGN["Generate Signed CloudFront Media URL"]
    PRI --> OWN["Allow Only Authorized Owner / Private Access"]
    OWN --> SIGN
    ORG --> MEMBER["Validate Organization Membership Or Policy"]
    MEMBER --> SIGN

    SIGN --> RESP["Return Playback Payload"]
    RESP --> PLAYER["Frontend Player Loads Media"]

    PLAYER --> VIEW["Record View"]
    PLAYER --> WATCH["Track Watch Progress"]
    VIEW --> DB["Record VideoView"]
    WATCH --> DB2["Upsert WatchHistory"]
```

### Video interaction and analytics flow

```mermaid
flowchart TD
    U["Authenticated Viewer"] --> PLAYER["Frontend Playback And Action UI"]

    PLAYER --> REACT["Save Reaction"]
    REACT --> DB1["Create Or Update VideoReaction"]

    PLAYER --> COMMENT["Create Comment"]
    COMMENT --> DB2["Create VideoComment"]

    PLAYER --> SHARE["Record Share"]
    SHARE --> DB3["Create VideoShare"]

    PLAYER --> PLAYLIST["Update Playlist"]
    PLAYLIST --> DB4["Create Playlist Or Add VideoAction Link"]

    PLAYER --> SUB["Toggle Subscription"]
    SUB --> DB5["Toggle Channel Subscription"]

    PLAYER --> READ1["Load Interaction Summary"]
    READ1 --> AGG1["Aggregate Counts, Reactions, Comments, Playlist State"]
    AGG1 --> PLAYER

    PLAYER --> READ2["Load Favorites"]
    PLAYER --> READ3["Load Playlists"]
    PLAYER --> READ4["Load Playlists With Videos"]
    PLAYER --> READ5["Load Activity Feed"]

    DB1 --> ADMIN["Admin / Organization Analytics"]
    DB2 --> ADMIN
    DB3 --> ADMIN
    DB5 --> ADMIN
```

### AI suggestion lifecycle

```mermaid
flowchart TD
    V["Video Record"] --> JOB["Video AI Worker"]
    JOB --> TRANS["Request Transcript From External AI Service"]
    TRANS --> EXT["External AI Service"]
    EXT --> META["Generate Title, Description, Keywords, Tags"]
    META --> SAVE["Persist VideoAI Record"]
    SAVE --> DB["MongoDB"]

    U["Creator Or Editor"] --> PROFILE["Profile / Video Edit UI"]
    PROFILE --> READ["Load AI Insights"]
    READ --> DB
    DB --> SUGGEST["Show Transcript And AI Suggestions"]

    SUGGEST --> APPLY["Apply Suggested Metadata"]
    APPLY --> MERGE["Copy AI Fields To Main Video Record"]
    MERGE --> DB2["Update Video Title / Description / Tags"]
```

### Notification flow

```mermaid
flowchart TD
    SRC1["Organization Invite Flow"] --> CREATE["Create Notification Record"]
    SRC2["Membership Approval Flow"] --> CREATE
    SRC3["General Platform Events"] --> CREATE
    CREATE --> DB["MongoDB Notification Collection"]

    U["Authenticated User"] --> NPAGE["Notification UI"]
    NPAGE --> LOAD["Load Notifications"]
    LOAD --> DB
    DB --> LIST["Return Notifications + unreadCount"]
    LIST --> NPAGE

    NPAGE --> READ1["Mark Notification Read"]
    READ1 --> DB

    NPAGE --> READALL["Mark All Notifications Read"]
    READALL --> DB
```

## Repository Layout

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

## Codebase Overview

The repository is split into two main applications:

- `backend/` for authentication, media orchestration, persistence, worker execution, queue handling, and real-time progress events
- `frontend/` for playback, uploads, discovery, profile management, organization tools, and admin workflows

Important backend entry files:

- `backend/src/app.ts`
  Express app setup, middleware registration, route mounting, and worker imports

- `backend/src/server.ts`
  HTTP server creation, Socket.IO setup, and progress event wiring

- `backend/prisma/schema.prisma`
  Prisma schema for the MongoDB data model

Important frontend entry files:

- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/layouts/AppLayout.tsx`

## Frontend Surface

The frontend is a protected single-page application centered on content discovery, playback, upload, and account management.

Key routes implemented in `frontend/src/App.tsx`:

- `/login`
- `/register`
- `/oauth-success`
- `/reset-password`
- `/video/:publicId`
- `/portrait`
- `/portrait/:publicId`
- `/home`
- `/upload`
- `/s3-import`
- `/favorites`
- `/playlists`
- `/profile`
- `/settings`
- `/search`
- `/organization`
- `/organization/dashboard`
- `/admin`

Main frontend areas:

- `frontend/src/pages` for product screens
- `frontend/src/components` for reusable media and navigation UI
- `frontend/src/layouts` for authenticated app shells
- `frontend/src/context` for auth and layout state
- `frontend/src/api` for backend integration

Notable frontend pages and components:

- `frontend/src/pages/Home.tsx` for discovery and featured media presentation
- `frontend/src/pages/Upload.tsx` for upload progress, AI state, and thumbnail selection
- `frontend/src/pages/ProfilePage.tsx` for profile editing and owned-video management
- `frontend/src/pages/AdminDashboard.tsx` for platform-level oversight
- `frontend/src/components/SpritesheetPicker.tsx` for frame-based thumbnail selection
- `frontend/src/context/AuthContext.tsx` for session and authentication state

Notable user-facing experiences:

- cinematic home feed with hero and row-based discovery
- upload workflow with processing progress and thumbnail selection
- S3 import workflow for existing bucket media
- profile library management for uploaded videos
- account settings covering notifications, privacy, preferences, sessions, and account lifecycle actions
- organization workspace and organization dashboard views
- platform admin reporting dashboard

## Backend Surface

The backend is an Express service layer with modular domain areas and background workers.

Primary backend domains:

- Auth module
  Registration, OTP verification, login, password reset, session-end tracking, and Google OAuth

- User module
  Profile data, avatar and cover updates, settings, session management, watch history cleanup, and account deactivate/delete actions

- Channel module
  Channel creation and maintenance

- Video module
  Upload completion, listing, search, portrait feeds, channel-scoped listings, spritesheet retrieval, thumbnail saving, owned-video updates, deletion, and S3 import helpers

- Video actions module
  Interaction flows such as views, likes, dislikes, comments, shares, watch events, and playlist linkage

- Organization module
  Organization creation, join links, invite workflows, member approval, uploader permissions, billing and subscription state, and organization-level content analytics

- Admin module
  Platform metrics, filter data, privileged user management, and admin access audit tracking

- Notification module
  Notification retrieval and state updates

- AI module
  AI metadata generation and application flows for videos

Key backend services and workers:

- Video processing orchestration
  Main post-upload orchestration for optimization, spritesheets, and queue dispatch

- Video metadata service
  Technical metadata extraction including duration, dimensions, codecs, and orientation

- Thumbnail service
  Thumbnail generation when a usable thumbnail does not already exist

- Realtime service
  Progress and completion event emission for the frontend

- Thumbnail worker
- Video AI worker
- Video metadata worker

## Data Model Highlights

The Prisma schema in `backend/prisma/schema.prisma` models:

- users, login sessions, and channels
- videos, AI records, and technical metadata
- reactions, comments, shares, watch history, and playlists
- organizations, memberships, invites, uploader access, and subscription state
- notifications
- admin access audits
- user-scoped S3 credentials

Video visibility supports:

- `PUBLIC`
- `PRIVATE`
- `ORGANIZATION`

Upload sources support:

- `MANUAL`
- `S3_IMPORT`

## Media Pipeline

Current upload and processing flow:

1. The client requests a presigned upload target.
2. The media file is uploaded to S3.
3. The client finalizes the upload flow.
4. The backend creates the video record and starts post-upload orchestration.
5. Processing generates optimized media outputs and a spritesheet.
6. Background jobs enrich AI data, thumbnails, and technical metadata.
7. Real-time events report progress back to the frontend.

Upload processing flow:

```mermaid
flowchart LR
    UI["Frontend Upload Page"] --> AUTH["Authenticated User Session"]
    AUTH --> PRE["Request Presigned Upload Target"]
    PRE --> API["Video Module"]
    API --> S3URL["Presigned S3 Upload URL"]
    S3URL --> UI

    UI --> PUT["Browser Uploads Video File To S3"]
    PUT --> S3["Raw Video Object In S3"]

    UI --> COMPLETE["Finalize Upload"]
    COMPLETE --> API
    API --> REC["Create Video Record"]
    REC --> DB["MongoDB"]

    REC --> ORCH["processVideoAfterUpload(...)"]
    ORCH --> DL["Download Uploaded File For Processing"]
    DL --> OPT["Optimize Streaming Layout"]
    OPT --> META0["Read Initial Media Facts<br/>Duration, Size, Dimensions"]
    META0 --> SPR["Generate Spritesheet"]
    SPR --> S3SPR["Store Spritesheet Assets In S3"]

    ORCH --> Q1["Enqueue Thumbnail Job"]
    ORCH --> Q2["Enqueue Metadata Job"]
    ORCH --> Q3["Enqueue AI Job"]

    Q1 --> TW["Thumbnail Worker"]
    Q2 --> MW["Video Metadata Worker"]
    Q3 --> AW["Video AI Worker"]

    TW --> TH["Generate Thumbnail If Needed"]
    TH --> S3TH["Store Thumbnail In S3"]
    TH --> DB1["Update Video Thumbnail State"]

    MW --> PROBE["ffprobe Metadata Extraction"]
    PROBE --> DB2["Persist VideoMetadata Record"]

    AW --> TRANS["Transcription Request"]
    TRANS --> EXT["External AI Service"]
    EXT --> GEN["Title, Description, Keywords, Tags"]
    GEN --> DB3["Persist VideoAI Record"]

    UI --> PICK["Load Spritesheet And Select Frame"]
    PICK --> API
    API --> CROP["Crop Selected Frame"]
    CROP --> S3TH
    CROP --> DB1

    ORCH --> RT["Emit Upload Progress"]
    TW --> RT
    MW --> RT
    AW --> RT
    RT --> SOCKET["Socket.IO Updates"]
    SOCKET --> UI
```

Organization and admin flow:

```mermaid
flowchart TD
    U["Authenticated User"] --> ORGFE["Organization And Admin Frontend"]

    ORGFE --> ORGAPI["Organization Services"]
    ORGFE --> ADMAPI["Admin Services"]
    ORGFE --> USERAPI["User Services"]
    ORGFE --> NOTI["Notification Services"]

    subgraph ORG["Organization Module Flows"]
        ORGAPI --> OC["Create Organization"]
        ORGAPI --> OJ["Join Via Public Or Private Token"]
        ORGAPI --> OI["Invite Members By Email"]
        ORGAPI --> OA["Approve Or Reject Memberships"]
        ORGAPI --> OP["Manage Upload Policies And Allowed Uploaders"]
        ORGAPI --> OD["Load Organization Dashboard"]
    end

    subgraph ADM["Admin Module Flows"]
        ADMAPI --> AM1["Aggregate Platform Metrics"]
        ADMAPI --> AM2["Filter Organizations And Activity"]
        ADMAPI --> AM3["Grant Or Remove Platform Admin Access"]
        ADMAPI --> AM4["Record Admin Access Audit Events"]
    end

    subgraph USER["User And Notification Flows"]
        USERAPI --> US1["Load Settings, Sessions, History, Preferences"]
        USERAPI --> US2["Revoke Sessions, Deactivate, Delete Account"]
        NOTI --> N1["Create And Read Notifications"]
    end

    OC --> DB["MongoDB"]
    OJ --> DB
    OI --> MAIL["Mail Service"]
    MAIL --> INV["Invite Email Delivery"]
    OI --> N1
    OA --> N1
    OP --> DB
    OD --> ANA["Views, Likes, Dislikes, Shares, Watch History Aggregation"]
    ANA --> DB

    AM1 --> DB
    AM2 --> DB
    AM3 --> DB
    AM3 --> AM4
    AM4 --> DB

    US1 --> DB
    US2 --> DB
    N1 --> DB
```

Current media-related capabilities in the codebase:

- presigned video uploads
- presigned thumbnail uploads
- spritesheet retrieval for frame picking
- CloudFront signed access for protected assets
- technical metadata extraction including duration, dimensions, codecs, and orientation

## Background Jobs And Workers

Worker entrypoint:

- `backend/src/workers/index.ts`

Registered worker areas:

- `backend/src/workers/thumbnail.worker.ts`
- `backend/src/workers/video-ai.worker.ts`
- `backend/src/workers/video-metadata.worker.ts`

These workers back the asynchronous parts of the media pipeline and keep expensive processing out of the request path.

Queue names used by the processing pipeline:

- `thumbnailQueue`
- `videoAIQueue`
- `videoMetadataQueue`

## AI Runtime

Whisper-style transcription and Ollama-style generation are not embedded directly in the main backend process. The repository delegates both steps to an external AI service configured through `AI_SERVER_URL`.

At a high level:

- transcription is handled as a Whisper-like step
- metadata generation is handled as an Ollama or general LLM-style step
- the video AI worker coordinates both steps and stores the output in `videoAI`

The worker-driven AI flow:

1. A video upload or import creates a pending `videoAI` record.
2. A job is added to `videoAIQueue`.
3. `backend/src/workers/video-ai.worker.ts` downloads the source video from S3.
4. The worker extracts audio with FFmpeg into MP3 form.
5. The worker sends audio to the external transcription service.
6. The worker sends the transcript to the external generation service.
7. The worker normalizes the response and stores transcript, title, description, keywords, and tags.
8. Real-time events notify the frontend about progress, completion, or failure.

Relevant AI files:

- `backend/src/workers/video-ai.worker.ts`
- `backend/src/modules/ai/ai.service.ts`
- `backend/src/utils/extract-audio.ts`
- `frontend/src/pages/Upload.tsx`

Typical `videoAI` fields populated by the worker:

- `transcript`
- `aiTitle`
- `aiDescription`
- `keywords`
- `tags`
- `status`

AI progress events used by the frontend:

- `ai-progress`
- `ai-completed`
- `ai-failed`

Common AI failure points:

- audio extraction fails before transcription begins
- the external AI service is unreachable
- generation returns malformed or incomplete structured output
- Redis or workers are unavailable, so `videoAIQueue` jobs are not consumed
- Socket.IO wiring prevents progress updates from reaching the upload UI

## Runtime Requirements

Running the full product requires more than installing dependencies.

Required services and infrastructure:

- MongoDB
- Redis
- AWS S3
- CloudFront signing setup
- FFmpeg and ffprobe available on the machine
- an external AI service reachable through `AI_SERVER_URL`

Important environment areas:

- database connection settings
- JWT secret and auth configuration
- AWS and CloudFront configuration
- Google OAuth configuration
- Redis connection settings
- AI service location
- email delivery settings
- client application URLs

## Operational Notes

- Prisma is configured for MongoDB.
- Media storage and generated assets are designed around S3 plus CloudFront delivery.
- AI enrichment is not self-contained in this repository; it depends on an external service integration.
- The application uses request/response services and Socket.IO to complete the upload and processing experience.
- Worker processes are required for AI, metadata, and thumbnail jobs to complete reliably.
- Setup steps and environment details are intentionally not included in this README.

## Additional Documentation

- [SETUP_GUIDE.md](./SETUP_GUIDE.md)
- [SKILLS_DEVELOPED.md](./SKILLS_DEVELOPED.md)
