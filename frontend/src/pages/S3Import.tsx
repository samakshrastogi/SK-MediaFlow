import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { api } from "@/api/axios";
import AppLayout from "@/layouts/AppLayout";
import axios from "axios";

interface Bucket {
    id: string;
    name: string;
    bucketName: string;
    region?: string | null;
    endpoint?: string | null;
}

interface S3File {
    key: string;
    size?: number;
}

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".mkv", ".webm"];

const isVideoFile = (key: string) => {
    return VIDEO_EXTENSIONS.some((ext) =>
        key.toLowerCase().endsWith(ext)
    );
};

const S3Import = () => {
    const [buckets, setBuckets] = useState<Bucket[]>([]);
    const [selectedBucket, setSelectedBucket] = useState<number | null>(null);

    const [files, setFiles] = useState<S3File[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

    const [scanning, setScanning] = useState(false);
    const [importing, setImporting] = useState(false);
    const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
    const [showAddModal, setShowAddModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importStats, setImportStats] = useState({
        total: 0,
        processed: 0,
        imported: 0,
        failed: 0,
    });
    const [uiMessage, setUiMessage] = useState("");

    const [bucketForm, setBucketForm] = useState({
        name: "",
        accessKey: "",
        secretKey: "",
        bucketName: "",
        region: "",
        endpoint: "",
    });

    /* ============================= Fetch Buckets ============================= */

    useEffect(() => {
        fetchBuckets();
    }, []);

    const fetchBuckets = async () => {
        const res = await api.get("/video/s3/buckets");
        setBuckets(res.data);
    };

    /* ============================= Add Bucket ============================= */

    const handleAddBucket = async () => {
        try {
            await api.post("/video/s3/buckets", bucketForm);
            setUiMessage("Bucket added successfully.");

            setShowAddModal(false);
            setBucketForm({
                name: "",
                accessKey: "",
                secretKey: "",
                bucketName: "",
                region: "",
                endpoint: "",
            });

            fetchBuckets();
        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                setUiMessage(error.response?.data?.message || "Request failed");
            } else if (error instanceof Error) {
                setUiMessage(error.message);
            } else {
                setUiMessage("Something went wrong");
            }
        }
    };

    /* ============================= Scan Bucket ============================= */

    const handleScan = async () => {
        if (!selectedBucket) {
            setUiMessage("Select a bucket first.");
            return;
        }

        try {
            setScanning(true);
            const res = await api.get(`/video/s3/buckets/${selectedBucket}/scan`);
            setFiles(res.data);
            setSelectedFiles([]);
        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                setUiMessage(error.response?.data?.message || "Request failed");
            } else if (error instanceof Error) {
                setUiMessage(error.message);
            } else {
                setUiMessage("Something went wrong");
            }
        } finally {
            setScanning(false);
        }
    };

    /* ============================= Filter Videos ============================= */

    const videoFiles = useMemo(() => {
        return files.filter((file) => isVideoFile(file.key));
    }, [files]);

    /* ============================= Folder Grouping ============================= */

    const folderMap = useMemo(() => {
        const map: Record<string, string[]> = {};

        videoFiles.forEach((file) => {
            const parts = file.key.split("/");
            const folder = parts.length > 1 ? parts[0] : "root";

            if (!map[folder]) map[folder] = [];
            map[folder].push(file.key);
        });

        return map;
    }, [videoFiles]);

    /* ============================= Selection Logic ============================= */

    const toggleFile = (key: string) => {
        setSelectedFiles((prev) =>
            prev.includes(key)
                ? prev.filter((k) => k !== key)
                : [...prev, key]
        );
    };

    const toggleFolder = (folder: string) => {
        const folderFiles = folderMap[folder];

        const allSelected = folderFiles.every((f) =>
            selectedFiles.includes(f)
        );

        if (allSelected) {
            setSelectedFiles((prev) =>
                prev.filter((f) => !folderFiles.includes(f))
            );
        } else {
            setSelectedFiles((prev) => [
                ...new Set([...prev, ...folderFiles]),
            ]);
        }
    };

    const toggleSelectAll = () => {
        if (selectedFiles.length === videoFiles.length) {
            setSelectedFiles([]);
        } else {
            setSelectedFiles(videoFiles.map((f) => f.key));
        }
    };

    /* ============================= Import ============================= */

    const handleImport = async () => {
        if (!selectedBucket || selectedFiles.length === 0) return;

        try {
            setImporting(true);
            setShowImportModal(true);

            const total = selectedFiles.length;
            let processed = 0;
            let imported = 0;
            let failed = 0;

            setImportStats({
                total,
                processed: 0,
                imported: 0,
                failed: 0,
            });

            for (const key of selectedFiles) {
                try {
                    await api.post("/video/s3/import", {
                        credentialId: selectedBucket,
                        sourceKey: key,
                        visibility,
                    });
                    imported += 1;
                } catch (error) {
                    failed += 1;
                } finally {
                    processed += 1;
                    setImportStats({
                        total,
                        processed,
                        imported,
                        failed,
                    });
                }
            }

            setUiMessage(
                `Import completed. Imported: ${imported}/${total}${failed ? `, Failed: ${failed}` : ""}`
            );
            setSelectedFiles([]);
        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                setUiMessage(error.response?.data?.message || "Request failed");
            } else if (error instanceof Error) {
                setUiMessage(error.message);
            } else {
                setUiMessage("Something went wrong");
            }
        } finally {
            setImporting(false);
        }
    };

    return (
        <AppLayout>
            <div className="w-full px-3 sm:px-4 lg:px-6 pt-4 sm:pt-6 pb-8 sm:pb-10 space-y-6 sm:space-y-8">

                {/* Header */}
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-semibold text-white">
                        S3 Import Manager
                    </h1>

                    <button
                        onClick={() => setShowAddModal(true)}
                        className="bg-purple-600 hover:bg-purple-700 transition px-5 py-2 rounded-lg text-sm"
                    >
                        + Add Bucket
                    </button>
                </div>

                {uiMessage && (
                    <div className="bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-sm text-gray-100">
                        {uiMessage}
                    </div>
                )}


                {/* Bucket Selector */}

                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">

                    <select
                        className="
                        w-full px-4 py-3 rounded-xl
                        bg-black/40
                        border border-white/20
                        text-white
                        focus:border-purple-500
                        outline-none
                        "
                        aria-label="Select S3 bucket"
                        onChange={(e) =>
                            setSelectedBucket(
                                e.target.value ? Number(e.target.value) : null
                            )
                        }
                    >

                        <option value="">Choose bucket</option>

                        {buckets.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.name} ({b.bucketName})
                            </option>
                        ))}

                    </select>

                    <button
                        onClick={handleScan}
                        disabled={scanning}
                        className="bg-green-600 hover:bg-green-700 transition px-5 py-2 rounded-lg text-sm"
                    >
                        {scanning ? "Scanning..." : "Scan Bucket"}
                    </button>

                </div>


                {/* Files Section */}

                {videoFiles.length > 0 && (

                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-6">

                        <div className="flex justify-between items-center">

                            <h2 className="text-lg font-semibold">
                                Videos ({videoFiles.length})
                            </h2>
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-gray-300">Visibility:</span>

                                <button
                                    onClick={() => setVisibility("PUBLIC")}
                                    className={`px-4 py-1 rounded-lg text-sm ${visibility === "PUBLIC"
                                        ? "bg-green-600 text-white"
                                        : "bg-gray-700 text-gray-300"
                                        }`}
                                >
                                    Public
                                </button>

                                <button
                                    onClick={() => setVisibility("PRIVATE")}
                                    className={`px-4 py-1 rounded-lg text-sm ${visibility === "PRIVATE"
                                        ? "bg-purple-600 text-white"
                                        : "bg-gray-700 text-gray-300"
                                        }`}
                                >
                                    Private
                                </button>
                            </div>

                            <label className="flex items-center gap-2 text-sm">

                                <input
                                    type="checkbox"
                                    checked={selectedFiles.length === videoFiles.length}
                                    onChange={toggleSelectAll}
                                />

                                Select All

                            </label>

                        </div>


                        <div className="max-h-96 overflow-y-auto border border-white/10 rounded-xl">

                            {Object.keys(folderMap).map((folder) => (

                                <div key={folder} className="border-b border-white/10">

                                    {/* Folder */}

                                    <div className="bg-black/40 px-4 py-2 flex items-center gap-3">

                                        <input
                                            type="checkbox"
                                            checked={folderMap[folder].every((f) =>
                                                selectedFiles.includes(f)
                                            )}
                                            placeholder="Display Name"
                                            aria-label="Display Name"
                                            onChange={() => toggleFolder(folder)}
                                        />

                                        <span className="font-medium text-purple-300">
                                            📁 {folder}
                                        </span>

                                    </div>


                                    {/* Files */}

                                    {folderMap[folder].map((fileKey) => (

                                        <div
                                            key={fileKey}
                                            className="flex items-center gap-3 px-6 py-2 hover:bg-white/5 transition"
                                        >

                                            <input
                                                type="checkbox"
                                                checked={selectedFiles.includes(fileKey)}
                                                onChange={() => toggleFile(fileKey)}
                                                placeholder="Display Name"
                                                aria-label="Display Name"
                                            />

                                            <span className="text-sm text-gray-300">
                                                {fileKey.split("/").pop()}
                                            </span>

                                        </div>

                                    ))}

                                </div>

                            ))}

                        </div>

                        <button
                            onClick={handleImport}
                            disabled={importing || selectedFiles.length === 0}
                            className="bg-purple-600 hover:bg-purple-700 transition px-6 py-2 rounded-lg"
                        >
                            {importing
                                ? "Importing..."
                                : `Import (${selectedFiles.length})`}
                        </button>

                    </div>

                )}
                {/* Add Bucket Modal */}
                {showAddModal && (
                    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
                        <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#0b1120] p-5 sm:p-8 shadow-2xl">
                            {/* Close Button */}
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg"
                            >
                                ✕
                            </button>

                            <h2 className="text-xl font-semibold text-white mb-6">
                                Add S3 Bucket
                            </h2>

                            <div className="space-y-4">

                                <input
                                    placeholder="Display Name"
                                    className="w-full px-4 py-3 rounded-xl bg-black/50 border border-gray-700 text-white focus:border-blue-500 outline-none"
                                    value={bucketForm.name}
                                    onChange={(e) =>
                                        setBucketForm({ ...bucketForm, name: e.target.value })
                                    }
                                />

                                <input
                                    placeholder="Access Key"
                                    className="w-full px-4 py-3 rounded-xl bg-black/50 border border-gray-700 text-white focus:border-blue-500 outline-none"
                                    value={bucketForm.accessKey}
                                    onChange={(e) =>
                                        setBucketForm({ ...bucketForm, accessKey: e.target.value })
                                    }
                                />

                                <input
                                    placeholder="Secret Key"
                                    type="password"
                                    className="w-full px-4 py-3 rounded-xl bg-black/50 border border-gray-700 text-white focus:border-blue-500 outline-none"
                                    value={bucketForm.secretKey}
                                    onChange={(e) =>
                                        setBucketForm({ ...bucketForm, secretKey: e.target.value })
                                    }
                                />

                                <input
                                    placeholder="Bucket Name"
                                    className="w-full px-4 py-3 rounded-xl bg-black/50 border border-gray-700 text-white focus:border-blue-500 outline-none"
                                    value={bucketForm.bucketName}
                                    onChange={(e) =>
                                        setBucketForm({ ...bucketForm, bucketName: e.target.value })
                                    }
                                />

                                <input
                                    placeholder="Region (optional)"
                                    className="w-full px-4 py-3 rounded-xl bg-black/50 border border-gray-700 text-white focus:border-blue-500 outline-none"
                                    value={bucketForm.region}
                                    onChange={(e) =>
                                        setBucketForm({ ...bucketForm, region: e.target.value })
                                    }
                                />

                                <input
                                    placeholder="Custom Endpoint (optional)"
                                    className="w-full px-4 py-3 rounded-xl bg-black/50 border border-gray-700 text-white focus:border-blue-500 outline-none"
                                    value={bucketForm.endpoint}
                                    onChange={(e) =>
                                        setBucketForm({ ...bucketForm, endpoint: e.target.value })
                                    }
                                />

                                <div className="flex justify-end gap-3 pt-4">
                                    <button
                                        onClick={() => setShowAddModal(false)}
                                        className="px-5 py-2 rounded-xl border border-gray-600 text-gray-300 hover:bg-gray-800 transition"
                                    >
                                        Cancel
                                    </button>

                                    <button
                                        onClick={handleAddBucket}
                                        className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium hover:opacity-90 transition"
                                    >
                                        Add Bucket
                                    </button>
                                </div>

                            </div>
                        </div>
                    </div>
                )}
                {showImportModal && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
                        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#0b1120] p-4 sm:p-6 shadow-2xl space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-white">Import Progress</h3>
                                {!importing && (
                                    <button
                                        onClick={() => setShowImportModal(false)}
                                        className="text-gray-400 hover:text-white"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            <div className="space-y-2">
                                <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
                                    <div
                                        className="h-full bg-purple-600 transition-all"
                                        style={{
                                            width: `${importStats.total
                                                ? Math.round((importStats.processed / importStats.total) * 100)
                                                : 0}%`,
                                        }}
                                    />
                                </div>

                                <div className="text-sm text-gray-300">
                                    {importStats.total
                                        ? `${Math.round((importStats.processed / importStats.total) * 100)}%`
                                        : "0%"}
                                </div>
                            </div>

                            <div className="text-sm text-gray-300">
                                Imported videos: {importStats.imported} / {importStats.total}
                            </div>

                            <div className="text-sm text-gray-400">
                                Processed files: {importStats.processed} / {importStats.total}
                                {importStats.failed > 0 ? ` • Failed: ${importStats.failed}` : ""}
                            </div>

                            {!importing && (
                                <div className="flex justify-end pt-2">
                                    <button
                                        onClick={() => setShowImportModal(false)}
                                        aria-label="Close import progress"
                                        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-gray-300 transition hover:bg-white/14 hover:text-white"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </AppLayout>
    );
};

export default S3Import;
