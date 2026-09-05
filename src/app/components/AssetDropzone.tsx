'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Film, Music, Image as ImageIcon, CheckCircle2, AlertCircle, FileAudio, Search } from 'lucide-react';
import type { AssetRecord } from '@/server/db/index';

interface AssetDropzoneProps {
  onAssetsChanged?: (count: number) => void;
  externalRefreshSignal?: number;
}

export function AssetDropzone({ onAssetsChanged, externalRefreshSignal }: AssetDropzoneProps) {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [filterQuery, setFilterQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAssets = useCallback(async () => {
    try {
      const res = await fetch('/api/assets');
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets || []);
        onAssetsChanged?.(data.assets?.length || 0);
      }
    } catch {
      // ignore
    }
  }, [onAssetsChanged]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets, externalRefreshSignal]);

  const handleFilesUpload = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadStatus(null);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setUploadStatus({
          success: true,
          message: `Uploaded ${data.uploaded?.length || files.length} file(s)`,
        });
        fetchAssets();
      } else {
        setUploadStatus({
          success: false,
          message: data.error || 'Upload failed',
        });
      }
    } catch (err: any) {
      setUploadStatus({
        success: false,
        message: err.message || 'Network error during upload',
      });
    } finally {
      setUploading(false);
      setTimeout(() => setUploadStatus(null), 4000);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFilesUpload(e.dataTransfer.files);
    }
  };

  const filteredAssets = assets.filter((a) => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return (
      a.filename.toLowerCase().includes(q) ||
      a.tag.toLowerCase().includes(q) ||
      a.type.toLowerCase().includes(q)
    );
  });

  const getTagBadgeColor = (tag: string) => {
    switch (tag) {
      case 'talking-head':
        return 'bg-purple-950/60 text-purple-300 border-purple-800/50';
      case 'b-roll':
        return 'bg-blue-950/60 text-blue-300 border-blue-800/50';
      case 'screen-capture':
        return 'bg-cyan-950/60 text-cyan-300 border-cyan-800/50';
      case 'music':
        return 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50';
      case 'sfx-riser':
      case 'sfx-impact':
      case 'sfx-whoosh':
      case 'sfx-ui':
        return 'bg-amber-950/60 text-amber-300 border-amber-800/50';
      default:
        return 'bg-zinc-800/60 text-zinc-300 border-zinc-700/50';
    }
  };

  const renderTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Film className="w-3.5 h-3.5 text-blue-400" />;
      case 'audio':
        return <Music className="w-3.5 h-3.5 text-emerald-400" />;
      case 'image':
        return <ImageIcon className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <FileAudio className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  return (
    <div className="flex flex-col bg-[#121215] border border-[#222226] rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 bg-[#16161B] border-b border-[#222226] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold tracking-wide uppercase text-zinc-200">
            Media Catalog
          </span>
          <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-[#222226] text-zinc-400">
            {assets.length}
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-2" />
          <input
            type="text"
            placeholder="Filter assets..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-32 sm:w-40 pl-6 pr-2 py-0.5 text-[11px] bg-[#0A0A0B] border border-[#27272A] rounded text-zinc-200 focus:outline-none focus:border-[#4F8CFF]"
          />
        </div>
      </div>

      {/* Drag & Drop Zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`m-3 p-4 border border-dashed rounded-md flex flex-col items-center justify-center text-center cursor-pointer transition select-none ${
          isDragging
            ? 'border-[#4F8CFF] bg-[#4F8CFF]/10 text-zinc-100'
            : 'border-[#27272A] hover:border-zinc-500 bg-[#0A0A0B]/60 text-zinc-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFilesUpload(e.target.files);
          }}
        />

        <Upload className={`w-5 h-5 mb-1.5 ${isDragging ? 'text-[#4F8CFF]' : 'text-zinc-500'}`} />
        <p className="text-xs font-medium text-zinc-300">
          Drop footage, audio, or images into <code className="text-[#4F8CFF] font-mono">assets/raw/</code>
        </p>
        <p className="text-[10px] text-zinc-500 mt-0.5 font-mono">
          mp4, mov, webm, wav, mp3, png, jpg • read-only ingestion
        </p>

        {uploading && (
          <div className="mt-2 text-xs text-[#4F8CFF] flex items-center gap-1.5 font-mono animate-pulse">
            <span className="w-2 h-2 rounded-full bg-[#4F8CFF] animate-ping" />
            Ingesting & probing media...
          </div>
        )}

        {uploadStatus && (
          <div
            className={`mt-2 text-xs flex items-center gap-1 font-mono ${
              uploadStatus.success ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {uploadStatus.success ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5" />
            )}
            {uploadStatus.message}
          </div>
        )}
      </div>

      {/* Catalog Asset List */}
      <div className="px-3 pb-3 max-h-56 overflow-y-auto space-y-1.5">
        {filteredAssets.length === 0 ? (
          <div className="text-center py-6 text-zinc-500 text-xs font-mono">
            {assets.length === 0
              ? 'No media indexed yet. Drop files above to catalog.'
              : 'No assets matched the search filter.'}
          </div>
        ) : (
          filteredAssets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center justify-between p-2 rounded bg-[#0D0D10] border border-[#1C1C20] hover:border-[#27272D] transition text-xs font-mono"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {renderTypeIcon(asset.type)}
                <span className="truncate text-zinc-200" title={asset.filename}>
                  {asset.filename}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {/* Tag Badge */}
                <span
                  className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${getTagBadgeColor(
                    asset.tag
                  )}`}
                >
                  {asset.tag}
                </span>

                {/* Duration or Dimensions */}
                {asset.duration_sec ? (
                  <span className="text-[10px] text-zinc-400 bg-zinc-900 px-1 py-0.5 rounded">
                    {asset.duration_sec.toFixed(1)}s
                  </span>
                ) : asset.width && asset.height ? (
                  <span className="text-[10px] text-zinc-400 bg-zinc-900 px-1 py-0.5 rounded">
                    {asset.width}x{asset.height}
                  </span>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
