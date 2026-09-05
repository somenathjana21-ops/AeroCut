import React, { useMemo } from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import type { Theme } from '../schema';

interface CodeTerminalProps {
  codeSnippet: {
    language: string;
    code: string;
  };
  durationInFrames: number;
  theme: Theme;
}

interface Token {
  type: 'keyword' | 'string' | 'number' | 'comment' | 'punctuation' | 'identifier' | 'text';
  value: string;
}

const KEYWORDS = new Set([
  'const',
  'let',
  'var',
  'function',
  'return',
  'async',
  'await',
  'import',
  'export',
  'from',
  'if',
  'else',
  'for',
  'while',
  'class',
  'interface',
  'type',
  'new',
  'def',
  'in',
  'is',
  'try',
  'catch',
  'throw',
  'switch',
  'case',
  'default',
]);

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    const rest = line.slice(i);

    // Comments: // or #
    if (rest.startsWith('//') || rest.startsWith('#')) {
      tokens.push({ type: 'comment', value: rest });
      break;
    }

    // Strings
    const strMatch = rest.match(/^("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/);
    if (strMatch) {
      tokens.push({ type: 'string', value: strMatch[0] });
      i += strMatch[0].length;
      continue;
    }

    // Numbers
    const numMatch = rest.match(/^\b\d+(\.\d+)?\b/);
    if (numMatch) {
      tokens.push({ type: 'number', value: numMatch[0] });
      i += numMatch[0].length;
      continue;
    }

    // Identifiers & Keywords
    const idMatch = rest.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
    if (idMatch) {
      const val = idMatch[0];
      const type = KEYWORDS.has(val) ? 'keyword' : 'identifier';
      tokens.push({ type, value: val });
      i += val.length;
      continue;
    }

    // Punctuation and operators
    const punctMatch = rest.match(/^(=>|===|!==|==|!=|<=|>=|&&|\|\||\+\+|--|[+\-*\/=<>:;,.\{\}\(\)\[\]])/);
    if (punctMatch) {
      tokens.push({ type: 'punctuation', value: punctMatch[0] });
      i += punctMatch[0].length;
      continue;
    }

    // Whitespace and fallback characters
    tokens.push({ type: 'text', value: rest[0] });
    i += 1;
  }

  return tokens;
}

export const CodeTerminal: React.FC<CodeTerminalProps> = ({
  codeSnippet,
  durationInFrames,
  theme,
}) => {
  const frame = useCurrentFrame();

  const lines = useMemo(() => {
    const rawCode = codeSnippet?.code ?? '// No code provided';
    return rawCode.split('\n');
  }, [codeSnippet?.code]);

  // Reveal lines progressively across the duration (finishing at ~75% through)
  const revealEndFrame = Math.max(1, Math.floor(durationInFrames * 0.75));
  const visibleLineCount = Math.min(
    lines.length,
    Math.floor(
      interpolate(frame, [0, revealEndFrame], [1, lines.length + 0.99], {
        extrapolateRight: 'clamp',
        extrapolateLeft: 'clamp',
      })
    )
  );

  // Deterministic frame-derived cursor blink (on for 15 frames, off for 15 frames)
  const cursorVisible = frame % 30 < 15;

  const getTokenColor = (token: Token): string => {
    switch (token.type) {
      case 'keyword':
        return '#c678dd';
      case 'string':
        return '#98c379';
      case 'number':
        return '#d19a66';
      case 'comment':
        return '#676f7d';
      case 'punctuation':
        return '#61afef';
      case 'identifier':
        return '#e5c07b';
      default:
        return theme.foreground;
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: theme.background,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '5%',
        overflow: 'hidden',
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: 'absolute',
          width: '70%',
          height: '60%',
          background: `radial-gradient(circle, ${theme.accent}22 0%, transparent 70%)`,
          filter: 'blur(50px)',
          pointerEvents: 'none',
        }}
      />

      {/* Terminal window card */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '1200px',
          borderRadius: '16px',
          backgroundColor: '#0c0d12',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.8), 0 0 1px rgba(255, 255, 255, 0.2)',
          overflow: 'hidden',
        }}
      >
        {/* Title bar */}
        <div
          style={{
            height: '48px',
            backgroundColor: '#15161f',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 18px',
          }}
        >
          {/* macOS window control buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ff5f56' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ffbd2e' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#27c93f' }} />
          </div>

          {/* Language tag */}
          <div
            style={{
              fontFamily: theme.monoFontFamily || 'JetBrains Mono, monospace',
              fontSize: '13px',
              fontWeight: 600,
              color: '#8b92a5',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {codeSnippet.language}
          </div>

          <div style={{ width: '52px' }} />
        </div>

        {/* Code Content Body */}
        <div
          style={{
            padding: '24px 28px',
            fontFamily: theme.monoFontFamily || 'JetBrains Mono, monospace',
            fontSize: '24px',
            lineHeight: 1.55,
            overflowX: 'hidden',
          }}
        >
          {lines.slice(0, visibleLineCount).map((line, lineIdx) => {
            const tokens = tokenizeLine(line);
            const isCurrentRevealingLine = lineIdx === visibleLineCount - 1;

            return (
              <div
                key={lineIdx}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  minHeight: '36px',
                }}
              >
                {/* Line number */}
                <span
                  style={{
                    display: 'inline-block',
                    width: '44px',
                    color: '#495162',
                    userSelect: 'none',
                    textAlign: 'right',
                    marginRight: '24px',
                    fontSize: '18px',
                    lineHeight: '36px',
                  }}
                >
                  {lineIdx + 1}
                </span>

                {/* Code line tokens */}
                <div style={{ flex: 1, whiteSpace: 'pre', color: theme.foreground }}>
                  {tokens.map((tok, tIdx) => (
                    <span
                      key={tIdx}
                      style={{
                        color: getTokenColor(tok),
                      }}
                    >
                      {tok.value}
                    </span>
                  ))}

                  {/* Cursor on latest active line */}
                  {isCurrentRevealingLine && cursorVisible && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: '10px',
                        height: '24px',
                        backgroundColor: theme.accent,
                        marginLeft: '4px',
                        verticalAlign: 'middle',
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
