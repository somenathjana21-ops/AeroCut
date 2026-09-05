'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  ArrowDown,
  XCircle,
  Terminal,
  ChevronRight,
  Sparkles,
  Layers,
  Mic,
  Video,
  Database,
} from 'lucide-react';
import type { JobRecord, JobEventRecord } from '@/server/db/index';

interface AgentActivityStreamProps {
  selectedJob: JobRecord | null;
  events: JobEventRecord[];
  onCancelJob?: (jobId: string) => void;
  renderProgress?: { progress: number; renderedFrames: number; encodedFrames: number } | null;
}

const STAGES = [
  { id: 'INGESTION', label: 'Media Ingestion', icon: Database },
  { id: 'PLANNING', label: 'Narrative Director', icon: Sparkles },
  { id: 'SYNTHESIZING', label: 'Voice & Alignment', icon: Mic },
  { id: 'COMPOSING', label: 'Scene Composition', icon: Layers },
  { id: 'RENDERING', label: 'Hardware Render', icon: Video },
] as const;

export function AgentActivityStream({
  selectedJob,
  events,
  onCancelJob,
  renderProgress,
}: AgentActivityStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Live timer tick every 250ms so active stages like PLANNING display live ticking clock
  useEffect(() => {
    const isJobActive =
      selectedJob &&
      !['COMPLETE', 'FAILED', 'CANCELLED'].includes(selectedJob.status);

    if (isJobActive) {
      const timer = setInterval(() => setNow(Date.now()), 250);
      return () => clearInterval(timer);
    }
  }, [selectedJob]);

  // Handle auto-scroll
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events, autoScroll, renderProgress]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setAutoScroll(true);
    }
  };

  const handleCancel = async () => {
    if (!selectedJob || cancelling) return;
    setCancelling(true);
    try {
      await fetch(`/api/jobs/${selectedJob.id}`, { method: 'DELETE' });
      onCancelJob?.(selectedJob.id);
    } catch {
      // ignore
    } finally {
      setCancelling(false);
    }
  };

  // Group events by stage
  const groupedEvents = useMemo(() => {
    const groups: Record<string, JobEventRecord[]> = {
      QUEUE: [],
      INGESTION: [],
      PLANNING: [],
      SYNTHESIZING: [],
      COMPOSING: [],
      RENDERING: [],
      COMPLETE: [],
      FAILED: [],
      CANCELLED: [],
    };

    events.forEach((ev) => {
      const stageKey = groups[ev.stage] ? ev.stage : 'PLANNING';
      groups[stageKey].push(ev);
    });

    return groups;
  }, [events]);

  // Compute stage timings
  const stageTimings = useMemo(() => {
    const timings: Record<string, { durationSec: number; isActive: boolean; isDone: boolean }> = {};

    STAGES.forEach((stage, idx) => {
      const stageEvents = groupedEvents[stage.id] || [];
      const isCurrentStage = selectedJob?.status === stage.id;
      const isDone =
        selectedJob?.status === 'COMPLETE' ||
        (selectedJob &&
          STAGES.findIndex((s) => s.id === selectedJob.status) > idx);

      let durationSec = 0;
      if (stageEvents.length > 0) {
        const firstTime = new Date(stageEvents[0].created_at).getTime();
        const lastTime = isCurrentStage
          ? now
          : new Date(stageEvents[stageEvents.length - 1].created_at).getTime();
        durationSec = Math.max(0, (lastTime - firstTime) / 1000);
      } else if (isCurrentStage && selectedJob) {
        const startTime = new Date(selectedJob.updated_at).getTime();
        durationSec = Math.max(0, (now - startTime) / 1000);
      }

      timings[stage.id] = {
        durationSec,
        isActive: isCurrentStage,
        isDone: !!isDone,
      };
    });

    return timings;
  }, [groupedEvents, selectedJob, now]);

  if (!selectedJob) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[420px] bg-[#121215] border border-[#222226] rounded-lg p-6 text-center text-zinc-500 font-mono text-xs">
        <Terminal className="w-8 h-8 text-zinc-600 mb-2" />
        <p className="text-zinc-300 font-medium">No Active Job Selected</p>
        <p className="text-[11px] text-zinc-500 mt-1">
          Configure a prompt on the left or select a job from history to view live telemetry.
        </p>
      </div>
    );
  }

  const isJobRunning = !['COMPLETE', 'FAILED', 'CANCELLED'].includes(selectedJob.status);

  return (
    <div className="flex flex-col h-full bg-[#121215] border border-[#222226] rounded-lg overflow-hidden select-none">
      {/* Stream Header with Job Info & Actions */}
      <div className="px-3.5 py-2.5 bg-[#16161B] border-b border-[#222226] flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono font-bold text-xs uppercase text-zinc-200">
            Agent Telemetry
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#222226] text-[#4F8CFF] font-semibold truncate max-w-[120px]">
            {selectedJob.id}
          </span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase font-semibold ${
              selectedJob.mode === 'fast'
                ? 'bg-blue-950/70 text-blue-300 border-blue-800/50'
                : 'bg-purple-950/70 text-purple-300 border-purple-800/50'
            }`}
          >
            {selectedJob.mode}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isJobRunning && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 text-[11px] font-mono transition cursor-pointer disabled:opacity-50"
            >
              <XCircle className="w-3 h-3" />
              <span>{cancelling ? 'Cancelling...' : 'Cancel Job'}</span>
            </button>
          )}

          <div
            className={`text-[11px] font-mono px-2 py-0.5 rounded border uppercase font-bold ${
              selectedJob.status === 'COMPLETE'
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50'
                : selectedJob.status === 'FAILED'
                ? 'bg-rose-950/60 text-rose-300 border-rose-800/50'
                : selectedJob.status === 'CANCELLED'
                ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                : 'bg-[#4F8CFF]/15 text-[#4F8CFF] border-[#4F8CFF]/40 animate-pulse'
            }`}
          >
            {selectedJob.status}
          </div>
        </div>
      </div>

      {/* Stage Tracker Pipeline Bar */}
      <div className="grid grid-cols-5 gap-1 p-2 bg-[#0E0E11] border-b border-[#1C1C20] font-mono text-[10px]">
        {STAGES.map((stage) => {
          const timing = stageTimings[stage.id];
          const Icon = stage.icon;

          return (
            <div
              key={stage.id}
              className={`flex flex-col p-1.5 rounded border transition ${
                timing.isActive
                  ? 'border-[#4F8CFF] bg-[#4F8CFF]/10 text-white shadow-[0_0_10px_rgba(79,140,255,0.2)]'
                  : timing.isDone
                  ? 'border-emerald-900/50 bg-emerald-950/30 text-emerald-300'
                  : 'border-[#1E1E22] bg-[#0A0A0B] text-zinc-500'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <Icon className={`w-3 h-3 ${timing.isActive ? 'text-[#4F8CFF]' : ''}`} />
                {timing.isActive ? (
                  <Loader2 className="w-3 h-3 text-[#4F8CFF] animate-spin" />
                ) : timing.isDone ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Clock className="w-2.5 h-2.5 text-zinc-600" />
                )}
              </div>

              <span className="truncate font-semibold text-[10px] leading-tight">
                {stage.label}
              </span>

              <span className="text-[9px] mt-0.5 font-mono">
                {timing.durationSec > 0
                  ? `${timing.durationSec.toFixed(1)}s`
                  : timing.isActive
                  ? 'active'
                  : 'queued'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Render Progress Bar (Shown during RENDERING stage) */}
      {(selectedJob.status === 'RENDERING' || renderProgress) && (
        <div className="p-3 bg-[#0A0A0B] border-b border-[#222226] font-mono text-xs">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-zinc-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#4F8CFF] animate-ping" />
              Remotion Frame Encoding
            </span>
            <span className="text-[#4F8CFF] font-bold">
              {renderProgress ? `${(renderProgress.progress * 100).toFixed(1)}%` : 'Initializing...'}
            </span>
          </div>

          <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-[#222226]">
            <div
              className="h-full bg-gradient-to-r from-[#4F8CFF] to-cyan-400 transition-all duration-200"
              style={{
                width: `${Math.min(100, Math.max(3, (renderProgress?.progress || 0) * 100))}%`,
              }}
            />
          </div>

          {renderProgress && (
            <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
              <span>Rendered: {renderProgress.renderedFrames} frames</span>
              <span>Encoded: {renderProgress.encodedFrames} frames</span>
            </div>
          )}
        </div>
      )}

      {/* Live Activity Feed Stream */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-xs relative"
      >
        {events.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 font-mono text-xs">
            <Loader2 className="w-5 h-5 mx-auto mb-2 text-[#4F8CFF] animate-spin" />
            Initializing agent pipeline...
          </div>
        ) : (
          STAGES.map((stage) => {
            const stageEvents = groupedEvents[stage.id] || [];
            const timing = stageTimings[stage.id];
            if (stageEvents.length === 0 && !timing.isActive) return null;

            return (
              <div
                key={stage.id}
                className={`rounded border overflow-hidden transition ${
                  timing.isActive
                    ? 'border-[#4F8CFF]/50 bg-[#0E0E12]'
                    : 'border-[#1E1E24] bg-[#0A0A0C]'
                }`}
              >
                {/* Stage Header */}
                <div className="px-2.5 py-1.5 bg-[#141418] border-b border-[#1E1E24] flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ChevronRight className="w-3 h-3 text-[#4F8CFF]" />
                    <span className="text-zinc-200 uppercase">{stage.label}</span>
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    {timing.durationSec.toFixed(1)}s elapsed
                  </span>
                </div>

                {/* Stage Events Log */}
                <div className="p-2 space-y-1.5">
                  {stageEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-start gap-2 text-[11px] leading-relaxed"
                    >
                      <span className="text-zinc-600 text-[10px] shrink-0 pt-0.5">
                        {new Date(ev.created_at).toLocaleTimeString()}
                      </span>

                      {ev.level === 'error' ? (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      ) : ev.level === 'warn' ? (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4F8CFF]/80 shrink-0 mt-1.5" />
                      )}

                      <div className="flex-1 text-zinc-300 break-words">
                        {ev.message}
                      </div>
                    </div>
                  ))}

                  {/* Active stage animated heartbeat line to prevent feeling frozen */}
                  {timing.isActive && (
                    <div className="flex items-center gap-2 text-[11px] text-[#4F8CFF] pt-1 animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>
                        Stage in progress ({timing.durationSec.toFixed(1)}s)...
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Global failure message if any */}
        {selectedJob.status === 'FAILED' && selectedJob.error && (
          <div className="p-3 rounded bg-rose-950/70 border border-rose-800 text-rose-200 text-xs">
            <div className="flex items-center gap-1.5 font-bold mb-1">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              Pipeline Execution Error
            </div>
            <p className="font-mono text-[11px] whitespace-pre-wrap">{selectedJob.error}</p>
          </div>
        )}
      </div>

      {/* Auto-scroll paused indicator pill */}
      {!autoScroll && (
        <div className="absolute bottom-4 right-6 z-10">
          <button
            onClick={scrollToBottom}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#4F8CFF] hover:bg-[#3B76E1] text-white shadow-lg text-[11px] font-mono cursor-pointer transition animate-bounce"
          >
            <ArrowDown className="w-3 h-3" />
            <span>Resume auto-scroll</span>
          </button>
        </div>
      )}
    </div>
  );
}
