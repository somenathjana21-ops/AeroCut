'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Play, Film, Download, CheckCircle2, AlertCircle, Maximize2, ExternalLink } from 'lucide-react';
import type { JobRecord } from '@/server/db/index';
import type { CompositionProps } from '@/remotion/schema';
import { FastShort } from '@/remotion/compositions/FastShort';
import { QualityExplainer } from '@/remotion/compositions/QualityExplainer';

// Dynamically import Player with ssr: false to prevent hydration and DOM window errors
const Player = dynamic(
  () => import('@remotion/player').then((mod) => mod.Player),
  { ssr: false }
);

interface RemotionPreviewProps {
  selectedJob: JobRecord | null;
}

export function RemotionPreview({ selectedJob }: RemotionPreviewProps) {
  const [mounted, setMounted] = useState(false);
  const [showRenderedVideo, setShowRenderedVideo] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const parsedProps: CompositionProps | null = useMemo(() => {
    if (!selectedJob?.props_json) return null;
    try {
      return JSON.parse(selectedJob.props_json) as CompositionProps;
    } catch {
      return null;
    }
  }, [selectedJob?.props_json]);

  if (!selectedJob) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[360px] bg-[#121215] border border-[#222226] rounded-lg p-6 text-center text-zinc-500 font-mono text-xs">
        <Film className="w-8 h-8 text-zinc-600 mb-2" />
        <p className="text-zinc-300 font-medium">No Composition Loaded</p>
        <p className="text-[11px] text-zinc-500 mt-1">
          Select or start a job to inspect live canvas playback.
        </p>
      </div>
    );
  }

  // Requirement: "Only mount once props_json exists."
  const hasProps = Boolean(parsedProps);
  const isComplete = selectedJob.status === 'COMPLETE';

  return (
    <div className="flex flex-col bg-[#121215] border border-[#222226] rounded-lg overflow-hidden select-none">
      {/* Header */}
      <div className="px-3.5 py-2.5 bg-[#16161B] border-b border-[#222226] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-xs uppercase text-zinc-200">
            Remotion Canvas
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#222226] text-zinc-400">
            {hasProps ? `${parsedProps!.width}x${parsedProps!.height}` : 'Awaiting Props'}
          </span>
        </div>

        {/* Toggle between live Remotion Player and rendered MP4 */}
        {isComplete && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRenderedVideo(!showRenderedVideo)}
              className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#1C1C22] hover:bg-[#25252C] text-[#4F8CFF] border border-[#27272F] transition cursor-pointer"
            >
              {showRenderedVideo ? 'Switch to Remotion Player' : 'Watch Encoded MP4'}
            </button>
            <a
              href={`/api/media?jobId=${selectedJob.id}`}
              download={`${selectedJob.id}.mp4`}
              className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 transition"
              title="Download rendered MP4"
            >
              <Download className="w-3 h-3" />
              <span>MP4</span>
            </a>
          </div>
        )}
      </div>

      {/* Main Preview Screen */}
      <div className="relative w-full bg-[#0A0A0B] flex items-center justify-center min-h-[320px] max-h-[480px] p-2 overflow-hidden">
        {!hasProps ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-500 font-mono text-xs">
            <div className="w-10 h-10 rounded-full border border-dashed border-[#4F8CFF]/50 flex items-center justify-center mb-3 animate-pulse">
              <Film className="w-5 h-5 text-[#4F8CFF]" />
            </div>
            <p className="text-zinc-300 font-medium text-xs">
              Composition Props Not Ready
            </p>
            <p className="text-[11px] text-zinc-500 mt-1 max-w-xs">
              Current stage: <strong className="text-[#4F8CFF] uppercase">{selectedJob.status}</strong>. Remotion Player will mount once scene props are composed.
            </p>
          </div>
        ) : showRenderedVideo && isComplete ? (
          <div className="w-full flex justify-center items-center h-full">
            <video
              controls
              autoPlay
              src={`/api/media?jobId=${selectedJob.id}`}
              className="max-h-[440px] max-w-full rounded shadow-xl object-contain"
            />
          </div>
        ) : mounted ? (
          <div
            className="flex items-center justify-center w-full h-full max-h-[440px]"
            style={{
              aspectRatio: `${parsedProps!.width} / ${parsedProps!.height}`,
            }}
          >
            <Player
              component={
                (selectedJob.mode === 'fast' ? FastShort : QualityExplainer) as any
              }
              inputProps={parsedProps!}
              durationInFrames={parsedProps!.durationInFrames}
              compositionWidth={parsedProps!.width}
              compositionHeight={parsedProps!.height}
              fps={parsedProps!.fps}
              style={{
                width: '100%',
                height: '100%',
                maxHeight: '440px',
              }}
              controls
              autoPlay={false}
              loop
            />
          </div>
        ) : null}
      </div>

      {/* Footer Info */}
      {hasProps && (
        <div className="px-3.5 py-2 bg-[#121215] border-t border-[#222226] flex items-center justify-between text-[11px] font-mono text-zinc-400">
          <div className="flex items-center gap-3">
            <span>
              Duration: <strong className="text-zinc-200">{(parsedProps!.durationInFrames / parsedProps!.fps).toFixed(1)}s</strong> ({parsedProps!.durationInFrames} frames)
            </span>
            <span>
              FPS: <strong className="text-zinc-200">{parsedProps!.fps}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span>
              Scenes: <strong className="text-zinc-200">{parsedProps!.scenes?.length || 0}</strong>
            </span>
            <span>
              Words: <strong className="text-zinc-200">{parsedProps!.words?.length || 0}</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
