import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, X, File, CheckCircle2 } from "lucide-react";

interface FileUploaderProps {
  maxFileSize?: number;
  acceptedTypes?: string;
  onUploadComplete?: (fileUrl: string, fileName: string) => void;
}

interface UploadedFile {
  name: string;
  url: string;
}

export function FileUploader({
  maxFileSize = 10485760,
  acceptedTypes = "image/*,.pdf,.ai,.eps,.svg,.psd",
  onUploadComplete,
}: FileUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    
    if (file.size > maxFileSize) {
      setError(`File size exceeds ${Math.round(maxFileSize / 1024 / 1024)}MB limit`);
      return;
    }

    setError(null);
    setUploading(true);
    setProgress(10);

    try {
      const response = await fetch("/api/objects/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadURL } = await response.json();
      setProgress(30);

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

      setProgress(80);

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
      setProgress(100);

      const newFile = { name: fileName || file.name, url: objectPath };
      setUploadedFiles((prev) => [...prev, newFile]);
      onUploadComplete?.(objectPath, fileName || file.name);

      setTimeout(() => {
        setUploading(false);
        setProgress(0);
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
      setProgress(0);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedTypes}
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
            <p className="text-sm text-dark-gray">Uploading...</p>
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
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <File className="h-4 w-4 text-dark-gray" />
                <span className="text-sm text-dark-blue-night">{file.name}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeFile(index)}
                className="h-8 w-8 p-0"
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
