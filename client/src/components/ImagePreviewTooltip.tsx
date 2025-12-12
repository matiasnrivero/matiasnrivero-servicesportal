import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText } from "lucide-react";

interface ImagePreviewTooltipProps {
  fileUrl: string;
  fileName: string;
  className?: string;
  thumbnailSize?: "sm" | "md" | "lg";
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"];

const FILE_TYPE_COLORS: Record<string, string> = {
  pdf: "bg-red-100 text-red-700 border-red-200",
  ai: "bg-orange-100 text-orange-700 border-orange-200",
  psd: "bg-blue-100 text-blue-700 border-blue-200",
  eps: "bg-purple-100 text-purple-700 border-purple-200",
  dst: "bg-green-100 text-green-700 border-green-200",
  exp: "bg-teal-100 text-teal-700 border-teal-200",
  pes: "bg-cyan-100 text-cyan-700 border-cyan-200",
  jef: "bg-indigo-100 text-indigo-700 border-indigo-200",
  default: "bg-gray-100 text-gray-700 border-gray-200",
};

const THUMBNAIL_SIZES = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-16 w-16",
};

function getFileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function isImageFile(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  return IMAGE_EXTENSIONS.includes(ext);
}

function getFileTypeBadgeColor(extension: string): string {
  return FILE_TYPE_COLORS[extension.toLowerCase()] || FILE_TYPE_COLORS.default;
}

export function ImagePreviewTooltip({
  fileUrl,
  fileName,
  className = "",
  thumbnailSize = "md",
}: ImagePreviewTooltipProps) {
  const [imageError, setImageError] = useState(false);
  const extension = getFileExtension(fileName);
  const isImage = isImageFile(fileName) && !imageError;

  if (isImage) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className={`relative cursor-pointer ${THUMBNAIL_SIZES[thumbnailSize]} ${className}`}
            data-testid={`preview-trigger-${fileName}`}
          >
            <img
              src={fileUrl}
              alt={fileName}
              className="h-full w-full object-cover rounded-md border border-border"
              onError={() => setImageError(true)}
              data-testid={`img-thumbnail-${fileName}`}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="p-0 border-0 bg-transparent shadow-lg">
          <div className="bg-background rounded-lg border border-border p-2 shadow-xl">
            <img
              src={fileUrl}
              alt={fileName}
              className="max-w-[300px] max-h-[300px] object-contain rounded-md"
              data-testid={`img-preview-${fileName}`}
            />
            <p className="text-xs text-muted-foreground mt-2 text-center truncate max-w-[300px]">
              {fileName}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid={`file-badge-wrapper-${fileName}`}>
      <FileText className="h-4 w-4 text-muted-foreground" />
      <Badge 
        variant="outline" 
        className={`text-xs uppercase font-medium ${getFileTypeBadgeColor(extension)}`}
        data-testid={`badge-filetype-${fileName}`}
      >
        {extension || "FILE"}
      </Badge>
    </div>
  );
}

export function FilePreviewWithName({
  fileUrl,
  fileName,
  showFileName = true,
  thumbnailSize = "md",
}: ImagePreviewTooltipProps & { showFileName?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <ImagePreviewTooltip
        fileUrl={fileUrl}
        fileName={fileName}
        thumbnailSize={thumbnailSize}
      />
      {showFileName && (
        <span className="text-sm text-foreground truncate max-w-[200px]" title={fileName}>
          {fileName}
        </span>
      )}
    </div>
  );
}
