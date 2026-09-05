import React from 'react';
import { staticFile } from 'remotion';

export const FontLoader: React.FC = () => {
  return (
    <style>{`
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url('${staticFile('fonts/Inter-400.ttf')}') format('truetype');
      }
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 600;
        font-display: swap;
        src: url('${staticFile('fonts/Inter-600.ttf')}') format('truetype');
      }
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url('${staticFile('fonts/Inter-700.ttf')}') format('truetype');
      }
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 800;
        font-display: swap;
        src: url('${staticFile('fonts/Inter-800.ttf')}') format('truetype');
      }
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 900;
        font-display: swap;
        src: url('${staticFile('fonts/Inter-900.ttf')}') format('truetype');
      }
      @font-face {
        font-family: 'JetBrains Mono';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url('${staticFile('fonts/JetBrainsMono-400.ttf')}') format('truetype');
      }
      @font-face {
        font-family: 'JetBrains Mono';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url('${staticFile('fonts/JetBrainsMono-700.ttf')}') format('truetype');
      }
    `}</style>
  );
};
