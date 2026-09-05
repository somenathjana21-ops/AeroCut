import React from 'react';
import { Img, Video, interpolate, staticFile, useCurrentFrame } from 'remotion';
import type { KenBurnsProps, Theme } from '../schema';

interface DynamicMediaProps {
  assetPath?: string;
  kenBurns?: KenBurnsProps;
  durationInFrames: number;
  theme: Theme;
}

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.m4v']);

function isVideoFile(pathStr?: string): boolean {
  if (!pathStr) return false;
  const cleanPath = pathStr.split('?')[0].split('#')[0].toLowerCase();
  const lastDot = cleanPath.lastIndexOf('.');
  if (lastDot === -1) return false;
  return VIDEO_EXTENSIONS.has(cleanPath.slice(lastDot));
}

function resolveAssetSource(pathStr: string): string {
  if (
    pathStr.startsWith('http://') ||
    pathStr.startsWith('https://') ||
    pathStr.startsWith('data:') ||
    pathStr.startsWith('blob:')
  ) {
    return pathStr;
  }
  // Strip leading slash for staticFile()
  const normalized = pathStr.replace(/^[/\\]+/, '').replace(/\\/g, '/');
  return staticFile(normalized);
}

export const DynamicMedia: React.FC<DynamicMediaProps> = ({
  assetPath,
  kenBurns,
  durationInFrames,
  theme,
}) => {
  const frame = useCurrentFrame();
  const safeDuration = Math.max(1, durationInFrames);

  // Ken Burns driven by interpolate() with parameters passed as props, never computed inside
  const scale = kenBurns
    ? interpolate(frame, [0, safeDuration], [kenBurns.fromScale, kenBurns.toScale], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1.0;

  const translateX = kenBurns
    ? interpolate(frame, [0, safeDuration], [kenBurns.fromX, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;

  const translateY = kenBurns
    ? interpolate(frame, [0, safeDuration], [kenBurns.fromY, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;

  const mediaStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    transform: `scale(${scale}) translate3d(${translateX}px, ${translateY}px, 0)`,
    transformOrigin: 'center center',
  };

  // If no asset is provided, render a rich animated dark gradient backdrop (never empty/black)
  if (!assetPath) {
    const angle = interpolate(frame, [0, safeDuration], [0, 90], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const halfDuration = Math.max(1, Math.floor(safeDuration / 2));
    const pulse = interpolate(
      frame,
      [0, halfDuration, Math.max(halfDuration + 1, safeDuration)],
      [0.25, 0.45, 0.25],
      {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      }
    );

    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: theme.background,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: -40,
            background: `radial-gradient(circle at 50% 40%, ${theme.accent}${Math.round(
              pulse * 255
            ).toString(16).padStart(2, '0')} 0%, transparent 65%), linear-gradient(${angle}deg, ${theme.background} 0%, #15161e 100%)`,
            transform: `scale(${scale}) translate3d(${translateX}px, ${translateY}px, 0)`,
            transformOrigin: 'center center',
          }}
        />
        {/* Subtle grid pattern */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
            opacity: 0.7,
            pointerEvents: 'none',
          }}
        />
      </div>
    );
  }

  const src = resolveAssetSource(assetPath);
  const isVideo = isVideoFile(assetPath);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: theme.background,
        overflow: 'hidden',
      }}
    >
      {isVideo ? (
        <Video src={src} style={mediaStyle} />
      ) : (
        <Img src={src} style={mediaStyle} />
      )}
    </div>
  );
};
