'use client';

import React, { useState } from 'react';
import { Play, Sparkles, FileText, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import type { JobRecord } from '@/server/db/index';

interface JobConfigFormProps {
  onJobCreated: (job: JobRecord) => void;
  isProcessing?: boolean;
}

const VOICE_OPTIONS = [
  { id: 'en-US-ChristopherNeural', label: 'Christopher (US Male - Confident)' },
  { id: 'en-US-GuyNeural', label: 'Guy (US Male - Conversational)' },
  { id: 'en-US-JennyNeural', label: 'Jenny (US Female - Clear)' },
  { id: 'en-US-AriaNeural', label: 'Aria (US Female - Expressive)' },
  { id: 'en-GB-RyanNeural', label: 'Ryan (UK Male - Authoritative)' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia (UK Female - Professional)' },
];

export function JobConfigForm({ onJobCreated, isProcessing }: JobConfigFormProps) {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'fast' | 'quality'>('fast');
  const [voice, setVoice] = useState('en-US-ChristopherNeural');
  const [showScriptInput, setShowScriptInput] = useState(false);
  const [sourceScript, setSourceScript] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleApplyPreset = (presetText: string, presetMode: 'fast' | 'quality') => {
    setPrompt(presetText);
    setMode(presetMode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || submitting) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          mode,
          voice,
          aspectRatio: mode === 'fast' ? '9:16' : '16:9',
          sourceScript: sourceScript.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to enqueue job');
      }

      // Notify parent immediately with the created job
      onJobCreated(data.job);
      setPrompt('');
      setSourceScript('');
      setShowScriptInput(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Submission error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col bg-[#121215] border border-[#222226] rounded-lg p-3.5 gap-3 text-xs"
    >
      <div className="flex items-center justify-between pb-1 border-b border-[#222226]">
        <span className="font-mono font-bold uppercase tracking-wider text-zinc-200">
          Job Configuration
        </span>
        <span className="text-[10px] font-mono text-zinc-500">
          Orchestration Pipeline
        </span>
      </div>

      {/* Mode Selection Toggle */}
      <div>
        <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1.5 font-medium">
          Render Mode
        </label>
        <div className="grid grid-cols-2 gap-2 font-mono">
          <button
            type="button"
            onClick={() => setMode('fast')}
            className={`p-2 rounded border text-left transition cursor-pointer ${
              mode === 'fast'
                ? 'border-[#4F8CFF] bg-[#4F8CFF]/10 text-white'
                : 'border-[#222226] bg-[#0A0A0B] text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-white">Fast Mode</span>
              <span className="text-[10px] px-1 py-0.2 rounded bg-blue-950 text-blue-300">9:16</span>
            </div>
            <p className="text-[10px] text-zinc-400 mt-1 leading-tight">
              Shorts/Reels • ≤45s • Kinetic subs • High energy
            </p>
          </button>

          <button
            type="button"
            onClick={() => setMode('quality')}
            className={`p-2 rounded border text-left transition cursor-pointer ${
              mode === 'quality'
                ? 'border-[#4F8CFF] bg-[#4F8CFF]/10 text-white'
                : 'border-[#222226] bg-[#0A0A0B] text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-white">Quality Mode</span>
              <span className="text-[10px] px-1 py-0.2 rounded bg-purple-950 text-purple-300">16:9</span>
            </div>
            <p className="text-[10px] text-zinc-400 mt-1 leading-tight">
              YouTube explainer • Landscape • Eased motion
            </p>
          </button>
        </div>
      </div>

      {/* Task Prompt Textarea */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-mono uppercase text-zinc-400 font-medium">
            Task Prompt
          </label>
          <div className="flex gap-1 text-[10px] font-mono">
            <button
              type="button"
              onClick={() =>
                handleApplyPreset(
                  'Explain how transformer attention heads work in 30 seconds with punchy kinetic hooks',
                  'fast'
                )
              }
              className="text-zinc-500 hover:text-[#4F8CFF] transition cursor-pointer"
            >
              [Short Preset]
            </button>
            <span className="text-zinc-700">|</span>
            <button
              type="button"
              onClick={() =>
                handleApplyPreset(
                  'A technical overview of browser rendering pipelines, DOM reflows, and GPU compositing',
                  'quality'
                )
              }
              className="text-zinc-500 hover:text-[#4F8CFF] transition cursor-pointer"
            >
              [Explainer Preset]
            </button>
          </div>
        </div>

        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your video narrative, pacing, and visual focus..."
          className="w-full bg-[#0A0A0B] border border-[#27272A] rounded p-2.5 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#4F8CFF] text-xs resize-none font-sans"
          required
        />
      </div>

      {/* Voice Selection */}
      <div>
        <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1.5 font-medium">
          Edge-TTS Voice
        </label>
        <select
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          className="w-full bg-[#0A0A0B] border border-[#27272A] rounded p-2 text-zinc-200 text-xs font-mono focus:outline-none focus:border-[#4F8CFF]"
        >
          {VOICE_OPTIONS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* Optional Script / Article Accordion */}
      <div className="border-t border-[#1C1C20] pt-2">
        <button
          type="button"
          onClick={() => setShowScriptInput(!showScriptInput)}
          className="flex items-center justify-between w-full text-zinc-400 hover:text-zinc-200 text-[11px] font-mono transition cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-zinc-500" />
            <span>Optional Source Script / Markdown</span>
          </div>
          {showScriptInput ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        {showScriptInput && (
          <div className="mt-2">
            <textarea
              rows={3}
              value={sourceScript}
              onChange={(e) => setSourceScript(e.target.value)}
              placeholder="Paste raw script text, article, or notes to guide Narrative Director..."
              className="w-full bg-[#0A0A0B] border border-[#27272A] rounded p-2 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#4F8CFF] text-xs font-mono resize-y"
            />
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-2 rounded bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-1.5 font-mono">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={submitting || !prompt.trim()}
        className="mt-1 flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded bg-[#4F8CFF] hover:bg-[#3B76E1] text-white font-mono font-bold tracking-wide uppercase text-xs shadow-[0_0_12px_rgba(79,140,255,0.3)] active:scale-[0.99] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Sparkles className="w-4 h-4" />
        <span>{submitting ? 'Enqueuing Job...' : 'Generate Video (Start Pipeline)'}</span>
      </button>
    </form>
  );
}
