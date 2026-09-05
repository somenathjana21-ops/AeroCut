'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAeroCutSocket, type WsMessage } from './hooks/useAeroCutSocket';
import { SystemHealthBar } from './components/SystemHealthBar';
import { JobConfigForm } from './components/JobConfigForm';
import { AssetDropzone } from './components/AssetDropzone';
import { AgentActivityStream } from './components/AgentActivityStream';
import { RemotionPreview } from './components/RemotionPreview';
import { JobHistory } from './components/JobHistory';
import type { JobRecord, JobEventRecord } from '@/server/db/index';

export default function AeroCutConsolePage() {
  const { status: wsStatus, addListener } = useAeroCutSocket();

  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [selectedJobEvents, setSelectedJobEvents] = useState<JobEventRecord[]>([]);
  const [assetRefreshSignal, setAssetRefreshSignal] = useState(0);
  const [assetCount, setAssetCount] = useState(0);
  const [renderProgress, setRenderProgress] = useState<{
    progress: number;
    renderedFrames: number;
    encodedFrames: number;
  } | null>(null);

  // Fetch jobs list
  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        // Auto-select latest job if none selected
        setSelectedJob((prev) => {
          if (!prev && data.jobs && data.jobs.length > 0) {
            return data.jobs[0];
          }
          return prev;
        });
      }
    } catch {
      // ignore
    }
  }, []);

  // Fetch full details and events for a selected job
  const loadJobDetails = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedJob(data.job);
        setSelectedJobEvents(data.events || []);
      }
    } catch {
      // ignore
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Load events when selectedJob changes
  useEffect(() => {
    if (selectedJob?.id) {
      loadJobDetails(selectedJob.id);
    }
  }, [selectedJob?.id, loadJobDetails]);

  // Subscribe to real-time WebSocket events
  useEffect(() => {
    const removeListener = addListener((msg: WsMessage) => {
      // 1. New Job Enqueued
      if (msg.type === 'job:created') {
        const newJob = msg.job as JobRecord;
        if (newJob) {
          setJobs((prev) => [newJob, ...prev.filter((j) => j.id !== newJob.id)]);
          setSelectedJob(newJob);
          setSelectedJobEvents([]);
          setRenderProgress(null);
        }
      }

      // 2. Job Status Transition
      if (msg.type === 'job:status') {
        const jobId = msg.jobId as string;
        const status = msg.status as JobRecord['status'];
        if (jobId && status) {
          setJobs((prev) =>
            prev.map((j) => (j.id === jobId ? { ...j, status } : j))
          );

          setSelectedJob((current) => {
            if (current && current.id === jobId) {
              // Re-fetch job detail if transition carries props or completion
              if (['COMPOSING', 'RENDERING', 'COMPLETE', 'FAILED'].includes(status)) {
                loadJobDetails(jobId);
              }
              return { ...current, status };
            }
            return current;
          });
        }
      }

      // 3. Granular Stage Event Log
      if (msg.type === 'job:event') {
        if (selectedJob && msg.jobId === selectedJob.id) {
          const newEvent: JobEventRecord = {
            id: Date.now() + Math.random(),
            job_id: msg.jobId,
            stage: msg.stage,
            level: msg.level || 'info',
            message: msg.message,
            payload_json: msg.payload ? JSON.stringify(msg.payload) : null,
            created_at: new Date().toISOString(),
          };

          setSelectedJobEvents((prev) => {
            // Avoid duplicate messages if already present
            if (prev.some((e) => e.message === newEvent.message && e.stage === newEvent.stage)) {
              return prev;
            }
            return [...prev, newEvent];
          });
        }
      }

      // 4. Render Frame Progress
      if (msg.type === 'render:progress') {
        if (selectedJob && msg.jobId === selectedJob.id) {
          setRenderProgress({
            progress: msg.progress,
            renderedFrames: msg.renderedFrames,
            encodedFrames: msg.encodedFrames,
          });
        }
      }

      // 5. Assets Updated (Upload or Scan)
      if (msg.type === 'assets:updated') {
        setAssetRefreshSignal((prev) => prev + 1);
        if (typeof msg.count === 'number') {
          setAssetCount(msg.count);
        }
      }
    });

    return () => {
      removeListener();
    };
  }, [addListener, selectedJob, loadJobDetails]);

  const activeQueueCount = useMemo(() => {
    return jobs.filter((j) =>
      ['QUEUED', 'PLANNING', 'SYNTHESIZING', 'COMPOSING', 'RENDERING'].includes(j.status)
    ).length;
  }, [jobs]);

  const handleJobCreated = (newJob: JobRecord) => {
    setJobs((prev) => [newJob, ...prev.filter((j) => j.id !== newJob.id)]);
    setSelectedJob(newJob);
    setSelectedJobEvents([]);
    setRenderProgress(null);
  };

  const handleSelectJob = (job: JobRecord) => {
    setSelectedJob(job);
    setRenderProgress(null);
    loadJobDetails(job.id);
  };

  const handleCancelJob = (jobId: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: 'CANCELLED' } : j))
    );
    if (selectedJob?.id === jobId) {
      setSelectedJob((prev) => (prev ? { ...prev, status: 'CANCELLED' } : null));
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A0B] text-[#FAFAFA]">
      {/* Top System Health Bar */}
      <SystemHealthBar
        wsStatus={wsStatus}
        assetCount={assetCount}
        activeQueueCount={activeQueueCount}
        onRefreshAssets={() => setAssetRefreshSignal((s) => s + 1)}
      />

      {/* Main Console Workspace: 3 Columns Desktop, Stacks Below 1280px */}
      <main className="flex-1 p-3 grid grid-cols-1 xl:grid-cols-12 gap-3 max-w-[1920px] mx-auto w-full">
        {/* Left Column: Configuration & Raw Asset Ingestion (Width: 3.5 / 12) */}
        <section className="xl:col-span-4 flex flex-col gap-3">
          <JobConfigForm
            onJobCreated={handleJobCreated}
            isProcessing={
              selectedJob
                ? ['QUEUED', 'PLANNING', 'SYNTHESIZING', 'COMPOSING', 'RENDERING'].includes(
                    selectedJob.status
                  )
                : false
            }
          />
          <AssetDropzone
            externalRefreshSignal={assetRefreshSignal}
            onAssetsChanged={(cnt) => setAssetCount(cnt)}
          />
        </section>

        {/* Center Column: Live Agent Activity Stream (Width: 4.5 / 12) */}
        <section className="xl:col-span-4 flex flex-col min-h-[500px] xl:min-h-0">
          <AgentActivityStream
            selectedJob={selectedJob}
            events={selectedJobEvents}
            renderProgress={renderProgress}
            onCancelJob={handleCancelJob}
          />
        </section>

        {/* Right Column: Remotion Preview & Job History (Width: 4 / 12) */}
        <section className="xl:col-span-4 flex flex-col gap-3">
          <RemotionPreview selectedJob={selectedJob} />
          <JobHistory
            jobs={jobs}
            selectedJobId={selectedJob?.id}
            onSelectJob={handleSelectJob}
          />
        </section>
      </main>
    </div>
  );
}
