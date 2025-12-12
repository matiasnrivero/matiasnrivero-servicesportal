import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, X, CheckCircle2 } from "lucide-react";
import { ImagePreviewTooltip } from "@/components/ImagePreviewTooltip";

interface FileUploaderProps {
  maxFileSize?: number;
  acceptedTypes?: string;
  onUploadComplete?: (fileUrl: string, fileName: string) => void;
  onFileRemove?: (fileName: string) => void;
}

interface UploadedFile {
  name: string;
  url: string;
}

export function FileUploader({
  maxFileSize = 10485760,
  acceptedTypes = "image/*,.pdf,.ai,.eps,.svg,.psd",
  onUploadComplete,
  onFileRemove,
}: FileUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadSingleFile = async (file: File): Promise<UploadedFile | null> => {
    if (file.size > maxFileSize) {
      setError(`File "${file.name}" exceeds ${Math.round(maxFileSize / 1024 / 1024)}MB limit`);
      return null;
    }

    try {
      const response = await fetch("/api/objects/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadURL } = await response.json();

      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file");
      }

      const confirmResponse = await fetch("/api/artwork-files", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileURL: uploadURL.split("?")[0],
          fileName: file.name,
        }),
      });

      if (!confirmResponse.ok) {
        throw new Error("Failed to confirm upload");
      }

      const { objectPath, fileName } = await confirmResponse.json();
      return { name: fileName || file.name, url: objectPath };
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to upload ${file.name}`);
      return null;
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setUploading(true);
    setTotalFiles(files.length);
    setCurrentFileIndex(0);
    setProgress(0);

    const newFiles: UploadedFile[] = [];

    for (let i = 0; i < files.length; i++) {
      setCurrentFileIndex(i + 1);
      setProgress(Math.round(((i + 0.5) / files.length) * 100));
      
      const result = await uploadSingleFile(files[i]);
      if (result) {
        newFiles.push(result);
        onUploadComplete?.(result.url, result.name);
      }
      
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setUploadedFiles((prev) => [...prev, ...newFiles]);

    setTimeout(() => {
      setUploading(false);
      setProgress(0);
      setCurrentFileIndex(0);
      setTotalFiles(0);
    }, 500);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    const fileToRemove = uploadedFiles[index];
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
    if (fileToRemove && onFileRemove) {
      onFileRemove(fileToRemove.name);
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedTypes}
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      <div
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          uploading
            ? "border-gray-300 bg-gray-50 cursor-not-allowed"
            : "border-sky-blue-accent hover:border-sky-blue-accent/80 hover:bg-blue-lavender"
        }`}
      >
        {uploading ? (
          <div className="space-y-3">
            <div className="flex justify-center">
              <Upload className="h-8 w-8 text-sky-blue-accent animate-pulse" />
            </div>
            <p className="text-sm text-dark-gray">
              Uploading {currentFileIndex} of {totalFiles}...
            </p>
            <Progress value={progress} className="h-2 w-full max-w-xs mx-auto" />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-center">
              <Upload className="h-8 w-8 text-sky-blue-accent" />
            </div>
            <p className="text-sm font-medium text-dark-blue-night">
              Click to upload artwork file
            </p>
            <p className="text-xs text-dark-gray">
              Supports images, PDF, AI, EPS, SVG, PSD (max {Math.round(maxFileSize / 1024 / 1024)}MB)
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-500 flex items-center gap-2">
          <X className="h-4 w-4" />
          {error}
        </div>
      )}

      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-dark-blue-night">Uploaded Files:</p>
          {uploadedFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                <ImagePreviewTooltip
                  fileUrl={file.url}
                  fileName={file.name}
                  thumbnailSize="sm"
                />
                <span className="text-sm text-dark-blue-night truncate max-w-[200px]">{file.name}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeFile(index)}
                className="h-8 w-8 p-0"
                data-testid={`button-remove-file-${index}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
