import { Router } from "express"
import { authenticate, optionalAuthenticate } from "../../middlewares/auth.middleware"

import {
    handleRecordView,
    handleWatchProgress,
    handleReaction,
    handleComment,
    handleShare,
    handleToggleSubscribe,
    handleAddToPlaylist,
    handleGetVideoActions,
    handleGetPlaylists,
    handleCreatePlaylist,
    handleDeletePlaylist,
    handleRemoveVideoFromPlaylist,
    handleRemoveFavouriteVideo,
    handleGetFavouriteVideos,
    handleGetUserPlaylistsWithVideos,
    handleGetUserActivity
} from "./video-action.controller"

const router = Router()

router.post("/react", authenticate, handleReaction)
router.post("/view", optionalAuthenticate, handleRecordView)
router.post("/watch-progress", authenticate, handleWatchProgress)

router.post("/comment", authenticate, handleComment)
router.post("/share", authenticate, handleShare)
router.post("/subscribe", authenticate, handleToggleSubscribe)

router.post("/playlist", authenticate, handleAddToPlaylist)

router.get("/video/:publicId", optionalAuthenticate, handleGetVideoActions)

router.get("/playlists", authenticate, handleGetPlaylists)

router.post("/playlists", authenticate, handleCreatePlaylist)

router.delete("/playlists/:playlistId", authenticate, handleDeletePlaylist)

router.delete("/playlists/:playlistId/videos/:publicId", authenticate, handleRemoveVideoFromPlaylist)

router.get("/favorites", authenticate, handleGetFavouriteVideos)

router.delete("/favorites/:publicId", authenticate, handleRemoveFavouriteVideo)

router.get("/playlists-with-videos", authenticate, handleGetUserPlaylistsWithVideos)

router.get("/activity", authenticate, handleGetUserActivity)

export default router
