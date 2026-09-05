'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw, Cpu, Activity, Database, Radio } from 'lucide-react';
import type { SocketStatus } from '../hooks/useAeroCutSocket';

interface SystemHealthBarProps {
  wsStatus: SocketStatus;
  onRefreshAssets?: () => void;
  assetCount?: number;
  activeQueueCount?: number;
}

interface HealthData {
  status: string;
  nvencAvailable: boolean;
  queueDepth: number;
  totalJobs: number;
  totalAssets: number;
  timestamp: string;
}

export function SystemHealthBar({
  wsStatus,
  onRefreshAssets,
  assetCount,
  activeQueueCount,
}: SystemHealthBarProps) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastScanMsg, setLastScanMsg] = useState<string | null>(null);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data: HealthData = await res.json();
        setHealth(data);
      }
    } catch {
      // ignore transient health fetch error
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleManualScan = async () => {
    if (scanning) return;
    setScanning(true);
    setLastScanMsg(null);
    try {
      const res = await fetch('/api/assets/scan', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setLastScanMsg(`Scanned ${data.count} assets`);
        onRefreshAssets?.();
        fetchHealth();
      } else {
        setLastScanMsg('Scan failed');
      }
    } catch (err: any) {
      setLastScanMsg(err.message || 'Scan error');
    } finally {
      setScanning(false);
      setTimeout(() => setLastScanMsg(null), 4000);
    }
  };

  const queueDepth = activeQueueCount !== undefined ? activeQueueCount : health?.queueDepth ?? 0;
  const currentAssetCount = assetCount !== undefined ? assetCount : health?.totalAssets ?? 0;

  return (
    <header className="w-full bg-[#121215] border-b border-[#222226] px-4 py-2.5 flex items-center justify-between text-xs tracking-tight select-none">
      {/* Brand & Engine Identification */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 font-mono font-bold tracking-wider text-sm">
          <span className="w-2.5 h-2.5 bg-[#4F8CFF] rounded-sm shadow-[0_0_8px_rgba(79,140,255,0.6)]" />
          <span className="text-[#FAFAFA]">AEROCUT</span>
          <span className="text-[#4F8CFF] font-light">//</span>
          <span className="text-zinc-400 text-xs font-normal">ENGINE 0.1</span>
        </div>

        <div className="hidden sm:block h-3.5 w-px bg-[#222226] mx-1" />

        {/* WebSocket Connection State */}
        <div className="flex items-center gap-1.5 font-mono">
          <Radio
            className={`w-3.5 h-3.5 ${
              wsStatus === 'connected'
                ? 'text-emerald-400 animate-pulse'
                : wsStatus === 'reconnecting'
                ? 'text-amber-400 animate-bounce'
                : 'text-rose-500'
            }`}
          />
          <span
            className={`px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${
              wsStatus === 'connected'
                ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/60'
                : wsStatus === 'reconnecting'
                ? 'bg-amber-950/70 text-amber-300 border border-amber-800/60'
                : 'bg-rose-950/70 text-rose-300 border border-rose-800/60'
            }`}
          >
            {wsStatus === 'connected'
              ? 'WS 3001'
              : wsStatus === 'reconnecting'
              ? 'RECONNECTING'
              : 'WS OFFLINE'}
          </span>
        </div>
      </div>

      {/* Telemetry and Hardware Metrics */}
      <div className="flex items-center gap-3 font-mono">
        {/* NVENC GPU Status */}
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] ${
            health?.nvencAvailable
              ? 'border-emerald-900/50 bg-emerald-950/40 text-emerald-300'
              : 'border-zinc-800 bg-zinc-900/50 text-zinc-400'
          }`}
          title={health?.nvencAvailable ? 'NVIDIA NVENC Hardware Encoder Detected' : 'CPU Software Encoding (libx264)'}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>{health?.nvencAvailable ? 'NVENC ACTIVE' : 'CPU FALLBACK'}</span>
        </div>

        {/* Queue Depth */}
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] ${
            queueDepth > 0
              ? 'border-[#4F8CFF]/40 bg-[#4F8CFF]/10 text-[#4F8CFF]'
              : 'border-[#222226] bg-[#0A0A0B] text-zinc-400'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>
            QUEUE: <strong className="text-[#FAFAFA]">{queueDepth}</strong>
          </span>
        </div>

        {/* Catalog Asset Count & Quick Scan Trigger */}
        <div className="flex items-center gap-1.5 pl-1">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded border border-[#222226] bg-[#0A0A0B] text-zinc-300 text-[11px]">
            <Database className="w-3.5 h-3.5 text-zinc-400" />
            <span>
              ASSETS: <strong className="text-[#FAFAFA]">{currentAssetCount}</strong>
            </span>
          </div>

          <button
            onClick={handleManualScan}
            disabled={scanning}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#18181C] hover:bg-[#222226] text-zinc-200 border border-[#27272A] active:scale-95 transition cursor-pointer disabled:opacity-50"
            title="Scan assets/raw/ and assets/library/"
          >
            <RefreshCw className={`w-3 h-3 text-[#4F8CFF] ${scanning ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">{scanning ? 'Scanning...' : 'Scan'}</span>
          </button>

          {lastScanMsg && (
            <span className="text-[10px] text-emerald-400 animate-fade-in font-mono">
              {lastScanMsg}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
