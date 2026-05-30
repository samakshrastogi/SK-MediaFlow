import "../config/env"
import { PutBucketCorsCommand } from "@aws-sdk/client-s3"

import { s3 } from "../config/s3"

const bucket = process.env.AWS_BUCKET

const envOrigins = (process.env.S3_CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)

const cliOrigins = process.argv
    .slice(2)
    .map((origin) => origin.trim())
    .filter(Boolean)

const origins = Array.from(
    new Set([...cliOrigins, ...envOrigins, process.env.CLIENT_URL].filter(Boolean))
)

if (!bucket) {
    throw new Error("AWS_BUCKET is not configured")
}

if (!origins.length) {
    throw new Error(
        "No origins configured. Pass origins as arguments or set S3_CORS_ALLOWED_ORIGINS/CLIENT_URL."
    )
}

const main = async () => {
    await s3.send(
        new PutBucketCorsCommand({
            Bucket: bucket,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedOrigins: origins,
                        AllowedMethods: ["GET", "HEAD", "PUT", "POST"],
                        AllowedHeaders: ["*"],
                        ExposeHeaders: ["ETag", "x-amz-request-id", "x-amz-id-2"],
                        MaxAgeSeconds: 3000
                    }
                ]
            }
        })
    )

    console.log(`Updated CORS for s3://${bucket}`)
    console.log(`Allowed origins: ${origins.join(", ")}`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
