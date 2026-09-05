"use client";

import React, { useRef, useState } from "react";
import { UploadCloud, FileCode, FileCheck, RefreshCw, X } from "lucide-react";

export interface SpatialDropzoneFileInfo {
  fileName: string;
  format: string;
  vertexCount?: number;
  totalPlots?: number;
  areaHa: number;
  warnings?: string[];
}

export interface SpatialDropzoneProps {
  onFileUpload: (file: File) => void;
  loading: boolean;
  label?: string;
  sublabel?: string;
  acceptedFormats?: string;
  fileInfo?: SpatialDropzoneFileInfo | null;
  onReset?: () => void;
  compact?: boolean;
  className?: string;
}

export function SpatialDropzone({
  onFileUpload,
  loading,
  label = "Tarik & lepas berkas KML / KMZ / GeoJSON",
  sublabel,
  acceptedFormats = ".kml,.kmz,.geojson,.json",
  fileInfo,
  onReset,
  compact = false,
  className = "",
}: SpatialDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
    }
    e.target.value = "";
  };

  if (fileInfo) {
    return (
      <div
        className={`rounded-[13px] bg-white border border-black/[0.06] p-[13px] shadow-sm ${className}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-[34px] h-[34px] rounded-full bg-[#ecfdf5] text-[#059669] flex items-center justify-center flex-shrink-0 mt-0.5">
              <FileCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p
                className="text-[13px] font-semibold text-[#09090b] truncate"
                title={fileInfo.fileName}
              >
                {fileInfo.fileName}
              </p>
              <p className="text-[11px] text-[#71717a] mt-0.5 font-mono tabular-nums">
                <span className="font-semibold text-[#059669] uppercase">
                  {fileInfo.format}
                </span>
                {fileInfo.totalPlots !== undefined && ` • ${fileInfo.totalPlots} petak`}
                {fileInfo.vertexCount !== undefined && ` • ${fileInfo.vertexCount} titik batas`}
                {` • ${fileInfo.areaHa.toFixed(4)} Ha`}
              </p>
            </div>
          </div>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="p-1 rounded-[8px] text-[#71717a] hover:text-[#09090b] hover:bg-black/[0.04] transition-colors flex-shrink-0"
              title="Reset berkas"
              aria-label="Reset berkas"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {fileInfo.warnings && fileInfo.warnings.length > 0 && (
          <div className="mt-2.5 text-[11px] text-amber-800 bg-amber-50/80 border border-amber-200/80 rounded-[8px] p-2 leading-relaxed">
            {fileInfo.warnings.join(", ")}
          </div>
        )}

        {onReset && (
          <div className="flex items-center justify-between pt-2 mt-2.5 border-t border-black/[0.04]">
            <span className="text-[10px] text-[#71717a]">Berkas geospasial tervalidasi</span>
            <button
              type="button"
              onClick={onReset}
              className="text-[11px] font-medium text-rose-600 hover:text-rose-700 hover:underline transition-colors"
            >
              Reset Berkas
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !loading && fileInputRef.current?.click()}
      className={`relative rounded-[21px] bg-white border-2 border-dashed text-center cursor-pointer transition-all select-none ${
        compact ? "p-[13px]" : "p-[21px]"
      } ${
        isDragging
          ? "border-[#059669] bg-[#ecfdf5]/40 scale-[0.99]"
          : "border-black/[0.12] hover:border-[#059669] hover:bg-[#ecfdf5]/20"
      } ${loading ? "cursor-wait opacity-90" : ""} ${className}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFormats}
        disabled={loading}
        className="hidden"
        onChange={handleFileInputChange}
      />
      {loading ? (
        <div className="flex flex-col items-center justify-center py-2 space-y-2">
          <RefreshCw className="w-6 h-6 text-[#059669] animate-spin" />
          <p className="text-[12px] font-medium text-[#059669]">
            Mengekstrak poligon & memproses koordinat...
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center">
          <div className="w-[42px] h-[42px] rounded-full bg-[#ecfdf5] text-[#059669] flex items-center justify-center mx-auto mb-3">
            {isDragging ? (
              <UploadCloud className="w-5 h-5 animate-pulse" />
            ) : (
              <FileCode className="w-5 h-5" />
            )}
          </div>
          <p className="text-[13px] font-semibold text-[#09090b]">{label}</p>
          <p className="text-[12px] text-[#71717a] mt-1">
            {sublabel || (
              <>
                atau{" "}
                <span className="text-[#059669] font-medium underline underline-offset-2">
                  pilih dari komputer...
                </span>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

export default SpatialDropzone;
