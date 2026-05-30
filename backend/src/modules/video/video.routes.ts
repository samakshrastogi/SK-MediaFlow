import { Router } from "express"
import { authenticate, optionalAuthenticate } from "../../middlewares/auth.middleware"

import {
    getPresignedUrl,
    getThumbnailPresignedUrl,
    finishUpload,
    handleScanS3,
    importSelectedVideos,
    handleGetVideoById,
    handleGetVideos,
    handleGetPortraitVideos,
    handleGetOrganizationRowVideos,
    handleSearchVideos,
    handleGetAIInsights,
    handleGetChannelPublicVideos, 
    handleGetChannelPrivateVideos,
    handleGetChannelOrganizationVideos,
    handleGetUploadSpritesheet,
    handleGetUploadProcessingStatus,
    handleSaveThumbnailFromSpritesheet,
    handleUpdateOwnedVideo,
    handleDeleteOwnedVideo,
    handleGenerateAIAssets
} from "./video.controller"

import {
    addBucket,
    scanBucket,
    importVideo,
    listBuckets
} from "./s3.controller"

const router = Router()

router.post("/upload/presign", authenticate, getPresignedUrl)
router.post("/upload/thumbnail-presign", authenticate, getThumbnailPresignedUrl)
router.post("/upload/complete", authenticate, finishUpload)
router.get("/upload/:videoId/processing-status", authenticate, handleGetUploadProcessingStatus)
router.get("/upload/:videoId/spritesheet", authenticate, handleGetUploadSpritesheet)
router.post("/upload/:videoId/spritesheet/select-thumbnail", authenticate, handleSaveThumbnailFromSpritesheet)

router.get("/scan", authenticate, handleScanS3)
router.post("/import", authenticate, importSelectedVideos)

router.post("/s3/buckets", authenticate, addBucket)
router.get("/s3/buckets", authenticate, listBuckets)
router.get("/s3/buckets/:id/scan", authenticate, scanBucket)
router.post("/s3/import", authenticate, importVideo)

router.get("/ai-insights", authenticate, handleGetAIInsights)
router.get("/search", optionalAuthenticate, handleSearchVideos)

router.get("/", optionalAuthenticate, handleGetVideos)
router.get("/portrait", optionalAuthenticate, handleGetPortraitVideos)
router.get("/organization/:organizationId", authenticate, handleGetOrganizationRowVideos)

router.get("/channel/:channelId/public", handleGetChannelPublicVideos)

router.get(
    "/channel/:channelId/private",
    authenticate,
    handleGetChannelPrivateVideos
)
router.get(
    "/channel/:channelId/organization",
    authenticate,
    handleGetChannelOrganizationVideos
)
router.patch("/:publicId", authenticate, handleUpdateOwnedVideo)
router.post("/:publicId/generate-ai-assets", authenticate, handleGenerateAIAssets)
router.delete("/:publicId", authenticate, handleDeleteOwnedVideo)

// ✅ KEEP THIS LAST (VERY IMPORTANT)
router.get("/:publicId", optionalAuthenticate, handleGetVideoById)
export default router
