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

    F --> AX["Axios API Client"]
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
    R1 --> API1["POST /api/auth/register"]
    API1 --> DB["User Record Created In MongoDB"]
    API1 --> OTP["OTP Generated And Sent"]
    OTP --> V1["POST /api/auth/verify-otp"]
    V1 --> DB
    DB --> READY["Verified Account Ready For Login"]

    A1 --> L1["Login"]
    L1 --> API2["POST /api/auth/login"]
    API2 --> AUTH["Validate Password / Provider State"]
    AUTH --> LOGINREC["Create UserLogin Session Record"]
    LOGINREC --> JWT["Issue JWT Token"]
    JWT --> FE["Token Stored In Frontend Auth Context"]

    A1 --> G1["Google Sign-In"]
    G1 --> GAPI["GET /api/auth/google"]
    GAPI --> GOOGLE["Google OAuth Consent"]
    GOOGLE --> GCALL["/api/auth/google/callback"]
    GCALL --> PROFILE["Find Or Create User + Channel Context"]
    PROFILE --> GLOGIN["Create UserLogin Session Record"]
    GLOGIN --> GJWT["Issue JWT And Redirect To /oauth-success"]
    GJWT --> FE

    A1 --> FP["Forgot Password"]
    FP --> FPAPI["POST /api/auth/forgot-password"]
    FPAPI --> MAIL["Reset Link Delivery"]
    MAIL --> RESET["POST /api/auth/reset-password"]
    RESET --> DB

    FE --> END["POST /api/auth/session-end"]
    END --> DB
```

### User settings and security flow

```mermaid
flowchart TD
    U["Authenticated User"] --> SET["Settings Page"]
    SET --> LOAD["GET /api/user/settings"]
    LOAD --> DB["User + UserLogin + Preferences Data"]
    DB --> SET

    SET --> PREF["PATCH /api/user/settings/preferences"]
    PREF --> SAVE1["Save Notification, Privacy, Preference Flags"]
    SAVE1 --> DB

    SET --> EMAIL["PATCH /api/user/settings/email"]
    EMAIL --> CHECKPW1["Validate Current Password If Required"]
    CHECKPW1 --> UPDATEEMAIL["Update Email, Reset Verification State"]
    UPDATEEMAIL --> REVOKE1["Revoke Sessions"]
    REVOKE1 --> OTP["Send Verification OTP"]
    OTP --> DB

    SET --> PASS["PATCH /api/user/settings/password"]
    PASS --> CHECKPW2["Validate Current Password"]
    CHECKPW2 --> HASH["Hash New Password"]
    HASH --> SAVE2["Persist New Password"]
    SAVE2 --> REVOKE2["Revoke Other Sessions"]
    REVOKE2 --> DB

    SET --> SESS1["POST /api/user/settings/sessions/revoke-others"]
    SESS1 --> DB

    SET --> SESS2["DELETE /api/user/sessions/:sessionId"]
    SESS2 --> DB

    SET --> HIST["DELETE /api/user/settings/history/watch"]
    HIST --> CLEAR["Clear WatchHistory"]
    CLEAR --> DB

    SET --> DEACT["POST /api/user/settings/account/deactivate"]
    DEACT --> DEACTSAVE["Mark deactivatedAt + Revoke Sessions"]
    DEACTSAVE --> DB

    SET --> DEL["POST /api/user/settings/account/delete"]
    DEL --> CONF["Require DELETE Confirmation"]
    CONF --> ANON["Anonymize User Fields + Mark deletedAt"]
    ANON --> DB
```

### Profile and media management flow

```mermaid
flowchart LR
    U["Authenticated Creator"] --> PROF["Profile Page"]
    PROF --> ME["GET /api/user/me"]
    ME --> DB["Load User, Channel, Stats, Uploaded Videos, History, Favorites, Playlists"]
    DB --> PROF

    PROF --> AV1["Request Avatar Upload URL"]
    AV1 --> S3A["Presigned S3 Target"]
    S3A --> AV2["Upload Avatar To S3"]
    AV2 --> AV3["Save Avatar Key In User Record"]
    AV3 --> CF["CloudFront Signed URL Returned"]

    PROF --> CV1["POST /api/user/cover-upload-url"]
    CV1 --> S3C["Presigned Cover Upload Target"]
    S3C --> CV2["Upload Cover To S3"]
    CV2 --> CV3["POST /api/user/cover"]
    CV3 --> DB2["Save coverKey"]
    DB2 --> CF

    PROF --> VIDEOS["Owned Video Management"]
    VIDEOS --> EDIT["PATCH /api/video/:publicId"]
    VIDEOS --> DEL["DELETE /api/video/:publicId"]
    EDIT --> DB3["Update Metadata, Visibility, Ownership Fields"]
    DEL --> DB4["Soft Delete / Status Update"]
```

### S3 import flow

```mermaid
flowchart TD
    U["Authenticated User"] --> IMP["S3 Import Page"]
    IMP --> CREDS["POST /api/video/s3/buckets"]
    CREDS --> DB["Store User S3 Credential Record"]

    IMP --> LIST["GET /api/video/s3/buckets"]
    LIST --> DB
    DB --> IMP

    IMP --> SCAN["GET /api/video/s3/buckets/:id/scan"]
    SCAN --> S3["External Bucket Listing"]
    S3 --> FILES["Return Candidate Media Files"]
    FILES --> IMP

    IMP --> PICK["Select Videos To Import"]
    PICK --> IMPORT["POST /api/video/s3/import or POST /api/video/import"]
    IMPORT --> VIDEO["Create Video Records With uploadSource = S3_IMPORT"]
    VIDEO --> DB2["Persist Imported Video Entries"]
    VIDEO --> ORCH["Start Standard Post-Upload Orchestration"]
    ORCH --> JOBS["Spritesheet + Metadata + Thumbnail + AI Jobs"]
```

### Playback access flow

```mermaid
flowchart TD
    U["Viewer"] --> PAGE["Video Player Or Portrait Player"]
    PAGE --> FETCH["GET /api/video/:publicId"]
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

    PLAYER --> VIEW["POST /api/video-actions/view"]
    PLAYER --> WATCH["POST /api/video-actions/watch-progress"]
    VIEW --> DB["Record VideoView"]
    WATCH --> DB2["Upsert WatchHistory"]
```

### Video interaction and analytics flow

```mermaid
flowchart TD
    U["Authenticated Viewer"] --> PLAYER["Frontend Playback And Action UI"]

    PLAYER --> REACT["POST /api/video-actions/react"]
    REACT --> DB1["Create Or Update VideoReaction"]

    PLAYER --> COMMENT["POST /api/video-actions/comment"]
    COMMENT --> DB2["Create VideoComment"]

    PLAYER --> SHARE["POST /api/video-actions/share"]
    SHARE --> DB3["Create VideoShare"]

    PLAYER --> PLAYLIST["POST /api/video-actions/playlist"]
    PLAYLIST --> DB4["Create Playlist Or Add VideoAction Link"]

    PLAYER --> SUB["POST /api/video-actions/subscribe"]
    SUB --> DB5["Toggle Channel Subscription"]

    PLAYER --> READ1["GET /api/video-actions/video/:publicId"]
    READ1 --> AGG1["Aggregate Counts, Reactions, Comments, Playlist State"]
    AGG1 --> PLAYER

    PLAYER --> READ2["GET /api/video-actions/favorites"]
    PLAYER --> READ3["GET /api/video-actions/playlists"]
    PLAYER --> READ4["GET /api/video-actions/playlists-with-videos"]
    PLAYER --> READ5["GET /api/video-actions/activity"]

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
    PROFILE --> READ["GET /api/video/ai-insights or GET /api/ai/video/:videoId"]
    READ --> DB
    DB --> SUGGEST["Show Transcript And AI Suggestions"]

    SUGGEST --> APPLY["POST /api/ai/video/:videoId/apply"]
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
    NPAGE --> LOAD["GET /api/notification"]
    LOAD --> DB
    DB --> LIST["Return Notifications + unreadCount"]
    LIST --> NPAGE

    NPAGE --> READ1["POST /api/notification/:id/read"]
    READ1 --> DB

    NPAGE --> READALL["POST /api/notification/read-all"]
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

Notable user-facing experiences:

- cinematic home feed with hero and row-based discovery
- upload workflow with processing progress and thumbnail selection
- S3 import workflow for existing bucket media
- profile library management for uploaded videos
- account settings covering notifications, privacy, preferences, sessions, and account lifecycle actions
- organization workspace and organization dashboard views
- platform admin reporting dashboard

## Backend Surface

The backend is an Express API with modular domain areas and background workers.

Mounted API prefixes in `backend/src/app.ts`:

- `/api/auth`
- `/api/user`
- `/api/video`
- `/api/channel`
- `/api/ai`
- `/api/video-actions`
- `/api/organization`
- `/api/notification`
- `/api/admin`

Primary backend domains:

- `backend/src/modules/auth`
  Registration, OTP verification, login, password reset, session-end tracking, and Google OAuth

- `backend/src/modules/user`
  Profile data, avatar and cover updates, settings, session management, watch history cleanup, and account deactivate/delete actions

- `backend/src/modules/channel`
  Channel creation and maintenance

- `backend/src/modules/video`
  Upload completion, listing, search, portrait feeds, channel-scoped listings, spritesheet retrieval, thumbnail saving, owned-video updates, deletion, and S3 import helpers

- `backend/src/modules/video/video-action.*`
  Interaction flows such as views, likes, dislikes, comments, shares, watch events, and playlist linkage

- `backend/src/modules/organization`
  Organization creation, join links, invite workflows, member approval, uploader permissions, billing and subscription state, and organization-level content analytics

- `backend/src/modules/admin`
  Platform metrics, filter data, privileged user management, and admin access audit tracking

- `backend/src/modules/notification`
  Notification retrieval and state updates

- `backend/src/modules/ai`
  AI metadata generation and application flows for videos

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
3. The client finalizes the upload with the API.
4. The backend creates the video record and starts post-upload orchestration.
5. Processing generates optimized media outputs and a spritesheet.
6. Background jobs enrich AI data, thumbnails, and technical metadata.
7. Real-time events report progress back to the frontend.

Upload processing flow:

```mermaid
flowchart LR
    UI["Frontend Upload Page"] --> AUTH["Authenticated User Session"]
    AUTH --> PRE["POST /api/video/upload/presign"]
    PRE --> API["Video Module"]
    API --> S3URL["Presigned S3 Upload URL"]
    S3URL --> UI

    UI --> PUT["Browser Uploads Video File To S3"]
    PUT --> S3["Raw Video Object In S3"]

    UI --> COMPLETE["POST /api/video/upload/complete"]
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

    UI --> PICK["GET Spritesheet And Select Frame"]
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

    ORGFE --> ORGAPI["/api/organization"]
    ORGFE --> ADMAPI["/api/admin"]
    ORGFE --> USERAPI["/api/user"]
    ORGFE --> NOTI["/api/notification"]

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

## Operational Notes

- Prisma is configured for MongoDB.
- Media storage and generated assets are designed around S3 plus CloudFront delivery.
- AI enrichment is not self-contained in this repository; it depends on an external service integration.
- The application uses both HTTP APIs and Socket.IO to complete the upload and processing experience.
- Setup steps and environment details are intentionally not included in this README.

## Additional Documentation

- [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)
- [SETUP_GUIDE.md](./SETUP_GUIDE.md)
- [WHISPER_OLLAMA_USAGE.md](./WHISPER_OLLAMA_USAGE.md)
- [SKILLS_DEVELOPED.md](./SKILLS_DEVELOPED.md)
