// @ts-nocheck
import {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand,
    PutObjectCommand,
    HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";

import { prisma } from "../../config/prisma";
import { encrypt, decrypt } from "../../utils/crypto";
import { s3 } from "../../config/s3";
import { generateThumbnail } from "../../utils/thumbnail";
import { emitNewVideoUploaded } from "../../services/realtime.service";
import { processVideoAfterUpload } from "./video-processing.service";

import fs from "fs";
import path from "path";
import os from "os";
import { pipeline } from "stream/promises";

const createS3Client = (
    accessKey: string,
    secretKey: string,
    region?: string | null,
    endpoint?: string | null
) => {
    return new S3Client({
        region: region || "us-east-1",
        endpoint: endpoint || undefined,
        forcePathStyle: !!endpoint,
        credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
        },
    });
};

export const addUserBucket = async (
    userId: string,
    name: string,
    accessKey: string,
    secretKey: string,
    region: string | null,
    bucketName: string,
    endpoint?: string | null
) => {
    const client = createS3Client(accessKey, secretKey, region, endpoint);

    await client.send(
        new ListObjectsV2Command({
            Bucket: bucketName,
            MaxKeys: 1,
        })
    );

    return prisma.s3Credential.create({
        data: {
            name,
            accessKey: encrypt(accessKey),
            secretKey: encrypt(secretKey),
            region,
            endpoint,
            bucketName,
            userId,
        },
    });
};

export const scanUserBucket = async (
    credentialId: string,
    userId: string
) => {
    const cred = await prisma.s3Credential.findFirst({
        where: { id: credentialId, userId },
    });

    if (!cred) throw new Error("Credential not found");

    const client = createS3Client(
        decrypt(cred.accessKey),
        decrypt(cred.secretKey),
        cred.region,
        cred.endpoint
    );

    let objects: any[] = [];
    let continuationToken: string | undefined;

    do {
        const response = await client.send(
            new ListObjectsV2Command({
                Bucket: cred.bucketName,
                ContinuationToken: continuationToken,
            })
        );

        if (response.Contents) {
            objects.push(...response.Contents);
        }

        continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return objects.map((obj) => ({
        key: obj.Key!,
        size: obj.Size,
    }));
};

export const importVideoFromUserBucket = async (
    credentialId: string,
    userId: string,
    sourceKey: string,
    visibility: "PUBLIC" | "PRIVATE" 
) => {
    const startTime = Date.now();

    const cred = await prisma.s3Credential.findFirst({
        where: { id: credentialId, userId },
        include: { user: { include: { channel: true } } },
    });

    if (!cred || !cred.user.channel) throw new Error("Channel not found");

    const client = createS3Client(
        decrypt(cred.accessKey),
        decrypt(cred.secretKey),
        cred.region,
        cred.endpoint
    );

    const fileName = sourceKey.split("/").pop()!;
    const uniqueName = `${Date.now()}_${fileName}`;

    const destinationKey =
        `${cred.user.channel.username}/videos/${uniqueName}`;

    const thumbnailKey =
        `${cred.user.channel.username}/thumbnails/${uniqueName.replace(/\.\w+$/, ".jpg")}`;

    const metadata = await client.send(
        new HeadObjectCommand({
            Bucket: cred.bucketName,
            Key: sourceKey,
        })
    );

    if (!metadata.ContentLength) throw new Error("Unable to determine file size");

    const tempVideoPath = path.join(os.tmpdir(), uniqueName);
    const tempThumbPath = path.join(
        os.tmpdir(),
        uniqueName.replace(/\.\w+$/, ".jpg")
    );

    const object = await client.send(
        new GetObjectCommand({
            Bucket: cred.bucketName,
            Key: sourceKey,
        })
    );

    if (!object.Body) throw new Error("Failed to retrieve file");

    await pipeline(object.Body as any, fs.createWriteStream(tempVideoPath));

    await s3.send(
        new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET!,
            Key: destinationKey,
            Body: fs.createReadStream(tempVideoPath),
            ContentType:
                metadata.ContentType || "application/octet-stream",
            ContentLength: metadata.ContentLength,
        })
    );

    await generateThumbnail(tempVideoPath, tempThumbPath);

    await s3.send(
        new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET!,
            Key: thumbnailKey,
            Body: fs.createReadStream(tempThumbPath),
            ContentType: "image/jpeg",
        })
    );

    const video = await prisma.video.create({
        data: {
            publicId: nanoid(10),
            title: fileName,
            s3Key: destinationKey,
            thumbnailKey,
            size: String(metadata.ContentLength),
            uploadSource: "S3_IMPORT",
            status: "ACTIVE",
            channelId: cred.user.channel.id,
            visibility: visibility || "PUBLIC",
        },
        include: { channel: true },
    });

    await processVideoAfterUpload(
        video.id,
        destinationKey,
        cred.user.channel.username
    );

    emitNewVideoUploaded({
        publicId: video.publicId,
        title: video.title || "Untitled",
        uploaderName: cred.user.name || cred.user.channel.name
    })

    try {
        fs.existsSync(tempVideoPath) && fs.unlinkSync(tempVideoPath);
        fs.existsSync(tempThumbPath) && fs.unlinkSync(tempThumbPath);
    } catch { }

    return {
        id: video.id,
        title: video.title,
        s3Key: video.s3Key,
        thumbnailKey: video.thumbnailKey,
        size: video.size.toString(),
        uploadSource: video.uploadSource,
        status: video.status,
        channelId: video.channelId,
        createdAt: video.createdAt,
        channel: video.channel,
        importTimeMs: Date.now() - startTime,
    };
};

export const listUserBuckets = async (userId: string) => {
    return prisma.s3Credential.findMany({
        where: { userId },
        select: {
            id: true,
            name: true,
            bucketName: true,
            region: true,
            endpoint: true,
        },
    });
};
