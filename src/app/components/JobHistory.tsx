'use client';

import React from 'react';
import { History, Download, Clock, CheckCircle2, AlertCircle, Play, XCircle } from 'lucide-react';
import type { JobRecord } from '@/server/db/index';

interface JobHistoryProps {
  jobs: JobRecord[];
  selectedJobId?: string;
  onSelectJob: (job: JobRecord) => void;
}

export function JobHistory({ jobs, selectedJobId, onSelectJob }: JobHistoryProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETE':
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 font-bold uppercase">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Done
          </span>
        );
      case 'FAILED':
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/50 font-bold uppercase">
            <AlertCircle className="w-2.5 h-2.5" />
            Failed
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-bold uppercase">
            <XCircle className="w-2.5 h-2.5" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#4F8CFF]/15 text-[#4F8CFF] border border-[#4F8CFF]/40 font-bold uppercase animate-pulse">
            <Clock className="w-2.5 h-2.5" />
            {status}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col bg-[#121215] border border-[#222226] rounded-lg overflow-hidden select-none">
      <div className="px-3.5 py-2.5 bg-[#16161B] border-b border-[#222226] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-3.5 h-3.5 text-[#4F8CFF]" />
          <span className="font-mono font-bold text-xs uppercase text-zinc-200">
            Job History
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#222226] text-zinc-400">
            {jobs.length}
          </span>
        </div>
        <span className="text-[10px] font-mono text-zinc-500">Newest First</span>
      </div>

      <div className="max-h-60 overflow-y-auto p-2 space-y-1.5">
        {jobs.length === 0 ? (
          <div className="text-center py-6 text-zinc-500 text-xs font-mono">
            No previous jobs recorded.
          </div>
        ) : (
          jobs.map((job) => {
            const isSelected = selectedJobId === job.id;

            return (
              <div
                key={job.id}
                onClick={() => onSelectJob(job)}
                className={`p-2.5 rounded border transition cursor-pointer font-mono text-xs ${
                  isSelected
                    ? 'border-[#4F8CFF] bg-[#161824]'
                    : 'border-[#1C1C20] bg-[#0A0A0C] hover:border-[#2A2A32] hover:bg-[#121216]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className={`text-[10px] uppercase px-1 py-0.2 rounded border font-semibold ${
                        job.mode === 'fast'
                          ? 'bg-blue-950/60 text-blue-300 border-blue-800/40'
                          : 'bg-purple-950/60 text-purple-300 border-purple-800/40'
                      }`}
                    >
                      {job.mode}
                    </span>
                    <span className="text-[11px] text-zinc-300 truncate font-semibold">
                      {job.id}
                    </span>
                  </div>

                  {getStatusBadge(job.status)}
                </div>

                <p className="text-[11px] text-zinc-400 font-sans truncate mb-1">
                  {job.prompt}
                </p>

                <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-[#18181D]">
                  <span>
                    {new Date(job.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>

                  {job.status === 'COMPLETE' && (
                    <a
                      href={`/api/media?jobId=${job.id}`}
                      download={`${job.id}.mp4`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-[#4F8CFF] hover:underline"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download MP4</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
