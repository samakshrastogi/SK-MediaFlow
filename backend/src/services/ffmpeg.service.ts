import { exec } from "child_process"
import { promisify } from "util"
import path from "path"
import fs from "fs"
import { ffmpegCommand } from "../config/ffmpeg"

const execAsync = promisify(exec)

export const generateMultipleThumbnails = async (
    inputPath: string,
    outputDir: string
): Promise<string[]> => {
    const timestamps = [1, 3, 5, 8, 13]

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    const outputs: string[] = []

    for (let i = 0; i < timestamps.length; i++) {

        const ts = timestamps[i]

        const outputPath = path.join(outputDir, `thumb_${i}.jpg`)

        outputs.push(outputPath)

        const command = `
        ${ffmpegCommand} -ss ${ts}
        -i "${inputPath}"
        -frames:v 1
        -vf "scale=1280:-2"
        -q:v 2
        -y "${outputPath}"
        `.replace(/\n/g, " ")

        try {
            await execAsync(command)
        } catch {
            outputs.pop()
        }

    }

    if (!outputs.length) {
        const fallbackPath = path.join(outputDir, "thumb_fallback.jpg")
        const fallbackCommand = `
        ${ffmpegCommand} -i "${inputPath}"
        -frames:v 1
        -vf "scale=1280:-2"
        -q:v 2
        -y "${fallbackPath}"
        `.replace(/\n/g, " ")

        await execAsync(fallbackCommand)
        outputs.push(fallbackPath)
    }

    return outputs

}
