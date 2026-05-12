# Whisper and Ollama Usage in sk-cinema

## Important Context

This repository does not run Whisper or Ollama directly inside the main backend process.

Instead, the backend AI worker sends requests to an external AI service configured through:

- `AI_SERVER_URL`

That AI service is expected to provide endpoints compatible with the current worker logic:

- `POST /transcribe`
- `POST /generate`

In practice:

- transcription behaves like a Whisper step
- generation behaves like an Ollama/LLM step

So this document explains the logical usage of Whisper and Ollama in the system, and where that integration is triggered.

---

## AI Flow Summary

The AI flow looks like this:

1. A video is uploaded or imported.
2. Backend post-upload processing creates a `videoAI` record with pending status.
3. A BullMQ job is added to `videoAIQueue`.
4. `backend/src/workers/video-ai.worker.ts` processes the job.
5. The worker downloads the video from S3.
6. The worker extracts audio as MP3.
7. The worker sends audio to the external AI server for transcription.
8. The worker sends the transcript to the external AI server for metadata generation.
9. The worker stores transcript, title, description, keywords, and tags in the database.
10. Socket events notify the frontend about progress and completion.

---

## Where Transcription Happens

### Trigger Point

The AI job is queued in:

- `backend/src/modules/video/video-processing.service.ts`

### Worker

The job is executed in:

- `backend/src/workers/video-ai.worker.ts`

### Audio Extraction

Audio is extracted using FFmpeg logic in:

- `backend/src/workers/video-ai.worker.ts`
- `backend/src/utils/extract-audio.ts`

In the worker, `fluent-ffmpeg` converts the uploaded video to MP3 before the transcription request is sent.

### Request to AI Server

The worker sends the extracted audio file to:

- `POST ${AI_SERVER_URL}/transcribe`

The expected response shape includes:

- `transcript`

That transcript is then used as input for the next step.

---

## Where Ollama-Style Generation Happens

After transcription, the worker sends a prompt to:

- `POST ${AI_SERVER_URL}/generate`

The prompt instructs the model to return strict JSON with:

- `title`
- `description`
- `keywords`
- `tags`

The worker then:

- extracts JSON from the raw response
- normalizes arrays
- applies fallbacks if the response is incomplete
- writes the result into the `videoAI` record

This logic lives in:

- `backend/src/workers/video-ai.worker.ts`

---

## Database Output

AI output is stored in the `videoAI` model.

Typical fields filled by the worker:

- `transcript`
- `aiTitle`
- `aiDescription`
- `keywords`
- `tags`
- `status`

That data is later used in:

- upload flow UI
- profile and video editing UX
- metadata endpoints
- optional AI suggestion application

---

## Applying AI Results

The AI module reads or applies stored metadata.

Relevant file:

- `backend/src/modules/ai/ai.service.ts`

Current behavior includes:

- reading generated metadata for a video
- applying AI title suggestions back to the main `video` record

---

## Real-Time Progress

The worker emits progress updates during the transcription/generation pipeline.

Relevant files:

- `backend/src/workers/video-ai.worker.ts`
- `backend/src/services/realtime.service.ts`
- `backend/src/server.ts`

Frontend consumers include:

- `frontend/src/pages/Upload.tsx`

Events emitted:

- `ai-progress`
- `ai-completed`
- `ai-failed`

This is how the upload screen knows when AI processing is still running or has completed.

---

## Why This Design Was Chosen

Using an external AI server instead of embedding Whisper and Ollama directly in the main backend has a few advantages:

- keeps the main API process lighter
- separates media/API concerns from AI runtime concerns
- allows local or remote AI infrastructure changes without rewriting the core app
- makes it easier to swap models or inference environments later

---

## Operational Requirements

For the AI flow to work, you need:

- backend API running
- Redis running
- worker process running
- AI server reachable at `AI_SERVER_URL`
- FFmpeg available locally
- S3 access working

If any of these fail, the worker can mark `videoAI.status` as `failed`.

---

## Common Failure Points

### No transcript generated

Possible causes:

- audio extraction failed
- AI server is offline
- `/transcribe` endpoint failed

### Metadata missing

Possible causes:

- transcript request succeeded but `/generate` failed
- LLM returned malformed JSON
- worker crashed before DB update

### Upload completes but AI never updates

Possible causes:

- worker process not running
- Redis unavailable
- `videoAIQueue` jobs not being consumed

### Progress UI does not update

Possible causes:

- Socket.IO connection mismatch
- backend server not emitting events
- worker never reaching progress milestones

---

## Relevant Files

### Backend

- `backend/src/modules/video/video-processing.service.ts`
- `backend/src/workers/video-ai.worker.ts`
- `backend/src/modules/ai/ai.service.ts`
- `backend/src/services/realtime.service.ts`
- `backend/src/server.ts`
- `backend/src/utils/extract-audio.ts`

### Frontend

- `frontend/src/pages/Upload.tsx`

---

## Summary

In `sk-cinema`:

- Whisper-style transcription is triggered by the video AI worker through an external AI server.
- Ollama-style metadata generation is triggered by the same worker after transcription.
- Results are stored in the database and surfaced back into the UI through APIs and real-time events.

The project’s AI integration is therefore:

- queue-driven
- worker-based
- dependent on external AI runtime services
- tightly connected to the upload and post-processing pipeline
