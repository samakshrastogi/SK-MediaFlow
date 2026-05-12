# Skills Developed Through sk-cinema

This project develops practical skills across full-stack product engineering, media systems, cloud integration, and AI workflow orchestration.

## Full-Stack Product Development

- Building a complete product with separate frontend and backend applications
- Designing flows that connect upload, playback, account management, and admin tooling
- Maintaining consistency across API contracts, UI state, and background processing

## React Frontend Engineering

- Building route-based SPA flows with React Router
- Creating reusable UI components such as cards, rows, nav, dialogs, and media pickers
- Managing auth state, caching, and request coordination in the client
- Handling responsive layout behavior for desktop and mobile

## Backend API Design

- Structuring an Express codebase into modules, controllers, routes, and services
- Designing authenticated REST endpoints for user, video, organization, and admin workflows
- Handling validation, authorization, and error shaping across multiple domains

## Database and Data Modeling

- Modeling a real application in Prisma on top of MongoDB
- Representing users, channels, videos, organizations, playlists, AI metadata, notifications, and interaction records
- Designing relationships and indexes around media-heavy application flows

## Media Processing

- Using FFmpeg and ffprobe for video processing
- Generating thumbnails and spritesheets
- Extracting technical video metadata
- Optimizing uploaded videos for better playback behavior

## Background Processing

- Using BullMQ queues and Redis-backed workers
- Splitting time-consuming jobs out of the main request lifecycle
- Coordinating API-triggered processing with worker execution and real-time progress updates

## Cloud Storage and Delivery

- Uploading media to S3 using presigned URLs
- Managing generated media assets in S3
- Delivering protected assets via signed CloudFront URLs
- Handling user-uploaded media such as avatars, covers, thumbnails, and videos

## Authentication and Identity

- Implementing local auth and Google OAuth
- Managing JWT-based sessions in the frontend/backend flow
- Supporting password reset and user login tracking

## Real-Time UX

- Using Socket.IO to surface background job progress
- Updating frontend upload flows in response to queue progress and completion events

## AI Workflow Integration

- Integrating transcription and metadata generation into a media workflow
- Orchestrating transcript extraction, prompt generation, and AI result persistence
- Applying AI-generated metadata back into the product experience

## Organization and Multi-Tenant Features

- Building organization-scoped video access and upload policies
- Supporting organization dashboards, invitations, membership, and restricted content flows

## Documentation and Maintenance

- Keeping architecture and setup documentation aligned with a moving codebase
- Translating implementation details into onboarding and maintenance guides

## Summary

`sk-cinema` builds experience in:

- frontend product UI
- backend API systems
- media processing
- cloud storage
- queue-based architecture
- authentication
- AI-assisted workflows
- maintainable documentation

It is a strong project for learning how real media products are assembled across the entire stack.
