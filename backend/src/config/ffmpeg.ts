import ffmpeg from "fluent-ffmpeg"

const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg")

export const FFMPEG_PATH =
    typeof ffmpegInstaller?.path === "string" && ffmpegInstaller.path
        ? ffmpegInstaller.path
        : "ffmpeg"

ffmpeg.setFfmpegPath(FFMPEG_PATH)

export const shellQuote = (value: string) =>
    `"${value.replace(/"/g, '\\"')}"`

export const ffmpegCommand = shellQuote(FFMPEG_PATH)

export { ffmpeg }
