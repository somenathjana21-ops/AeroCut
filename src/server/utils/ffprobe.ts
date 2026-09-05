import { execa } from 'execa';

export interface ProbeResult {
  durationSec: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
  codec?: string;
  type: 'video' | 'image' | 'audio';
  channels?: number;
}

export async function probeMedia(filePath: string): Promise<ProbeResult> {
  const { stdout } = await execa('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration,size',
    '-show_entries',
    'stream=index,codec_type,codec_name,width,height,r_frame_rate,channels',
    '-of',
    'json',
    filePath,
  ]);

  const data = JSON.parse(stdout);
  const durationSec = parseFloat(data.format?.duration || '0');
  const streams = data.streams || [];

  const videoStream = streams.find((s: any) => s.codec_type === 'video');
  const audioStream = streams.find((s: any) => s.codec_type === 'audio');

  const hasAudio = !!audioStream;
  const channels = audioStream?.channels ? parseInt(audioStream.channels, 10) : undefined;

  let fps: number | undefined;
  if (videoStream?.r_frame_rate) {
    const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
    if (den && den > 0 && num > 0) {
      fps = Math.round((num / den) * 100) / 100;
    }
  }

  let type: 'video' | 'image' | 'audio' = 'video';
  if (videoStream && !audioStream && durationSec === 0) {
    type = 'image';
  } else if (!videoStream && audioStream) {
    type = 'audio';
  } else if (videoStream) {
    type = 'video';
  }

  return {
    durationSec: Math.max(0, durationSec),
    width: videoStream?.width ? parseInt(videoStream.width, 10) : undefined,
    height: videoStream?.height ? parseInt(videoStream.height, 10) : undefined,
    fps,
    hasAudio,
    codec: videoStream?.codec_name || audioStream?.codec_name,
    type,
    channels,
  };
}
