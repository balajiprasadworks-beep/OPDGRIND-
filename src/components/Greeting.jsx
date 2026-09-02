import React from 'react'

// The two marks of the day: Hello! when the clinic is clocked in, Caio! when it
// is clocked out. Rebuilt from the doctor's own lettering — navy brush script,
// a cyan underline swoosh, three cyan sparks off the exclamation mark.
//
// It is deliberately small and short-lived: it appears under the walk in / walk
// out row where the click happened, never over the sheet, never in the way
// (pointer-events are off), and it is gone in well under two seconds.

const NAVY = '#152c53'
const CYAN = '#25bede'

// Geometry per word rather than anything computed: there are exactly two words,
// and hand-placed sparks sit better than an algorithm's.
const WORDS = {
  Hello: {
    text: 'Hello!',
    box: '0 0 224 104',
    x: 10,
    swoosh: 'M16 86 Q92 101 180 79',
    sparks: ['M182 34 L191 9', 'M195 33 L211 18', 'M201 45 L219 41']
  },
  Caio: {
    text: 'Caio!',
    box: '0 0 196 104',
    x: 10,
    swoosh: 'M16 86 Q80 101 154 79',
    sparks: ['M156 34 L165 9', 'M169 33 L185 18', 'M175 45 L193 41']
  }
}

export default function Greeting({ word }) {
  const art = WORDS[word]
  if (!art) return null

  return (
    <div className="greeting screen-only" aria-hidden="true">
      <svg className="greeting-art" viewBox={art.box} role="img">
        <path
          d={art.swoosh}
          fill="none"
          stroke={CYAN}
          strokeWidth="6"
          strokeLinecap="round"
        />
        {art.sparks.map((d) => (
          <path key={d} d={d} fill="none" stroke={CYAN} strokeWidth="6.5" strokeLinecap="round" />
        ))}
        <text
          x={art.x}
          y="70"
          fill={NAVY}
          style={{ font: '400 58px/1 "Pacifico Greeting", "Segoe Script", cursive' }}
        >
          {art.text}
        </text>
      </svg>
    </div>
  )
}

// What the sheet waits before clearing the greeting: 160ms in, 1200ms held,
// 380ms out. Kept beside the keyframes in app.css that it has to agree with.
export const GREETING_MS = 1740
