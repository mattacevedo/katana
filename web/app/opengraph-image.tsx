import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Katana — AI Grading Assistant for Canvas SpeedGrader';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 100%)',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Subtle grid pattern overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Sword emoji */}
        <div style={{ fontSize: 110, marginBottom: 20, display: 'flex' }}>
          ⚔️
        </div>

        {/* Wordmark */}
        <div
          style={{
            fontSize: 90,
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-0.03em',
            marginBottom: 18,
            display: 'flex',
          }}
        >
          Katana
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 34,
            color: '#94a3b8',
            textAlign: 'center',
            maxWidth: 820,
            lineHeight: 1.4,
            display: 'flex',
          }}
        >
          AI Grading Assistant for Canvas SpeedGrader
        </div>

        {/* Sub-tagline */}
        <div
          style={{
            marginTop: 28,
            fontSize: 26,
            color: '#60a5fa',
            fontWeight: 600,
            display: 'flex',
          }}
        >
          Less grading. More teaching.
        </div>

        {/* Bottom URL */}
        <div
          style={{
            position: 'absolute',
            bottom: 36,
            fontSize: 20,
            color: 'rgba(255,255,255,0.3)',
            display: 'flex',
          }}
        >
          gradewithkatana.com
        </div>
      </div>
    ),
    { ...size, emoji: 'twemoji' },
  );
}
