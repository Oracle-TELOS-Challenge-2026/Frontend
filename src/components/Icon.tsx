const paths = {
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2ZM7 2v4m10-4v4M3 10h18m-14 4h3m4 0h3m-10 3h3',
  chat: 'M21 11a8 8 0 0 1-8 8H7l-5 3 1.8-6A8 8 0 1 1 21 11ZM7 10h10m-10 4h6',
  search: 'M20 20l-5-5m2-6a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  'arrow-left': 'm14 5-7 7 7 7M7 12h14',
  'chevron-right': 'm9 5 7 7-7 7',
  'chevron-down': 'm5 9 7 7 7-7',
  close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  send: 'm22 2-7 20-4-9-9-4 20-7ZM11 13 22 2',
  sparkle: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z',
  store: 'M3 10v11h18V10M2 10l2-7h16l2 7c-1 3-4 3-5 0-1 3-4 3-5 0-1 3-4 3-5 0-1 3-4 3-5 0ZM9 21v-7h6v7',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  scissors: 'm21 3-9 9m0 0 9 9M8 8l4 4-4 4M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  heart: 'M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-4 5 2 10 8 15 6-5 12-10 8-15Z',
  settings: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  logout: 'M9 3H3v18h6m7-14 5 5-5 5M8 12h13',
}

export function Icon({ name, size = 22, className = '' }: { name: keyof typeof paths; size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={paths[name]} /></svg>
}

export function Mascot({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 220 230" fill="none" aria-hidden="true">
    <ellipse cx="110" cy="211" rx="64" ry="10" fill="#e8d7cb" opacity=".45" />
    <path d="M81 180c-9 9-17 19-12 23 7 5 19-2 29-13M127 187c7 9 18 19 24 14 6-5-3-16-10-23" fill="#F76B53" />
    <path d="M52 117c-21-3-33 7-29 17 3 7 14 2 30-2m111-14c20-5 33 2 31 12-2 7-16 4-29-1" fill="#FF947E" />
    <path d="M108 48c-35-24-78 7-73 60 4 51 34 83 76 83s73-34 75-85c2-49-43-79-78-58Z" fill="#FFAC94" />
    <path d="M108 48c-7 14-8 24-7 34" stroke="#F38B74" strokeWidth="4" strokeLinecap="round" />
    <path d="M111 49c0-30 15-43 36-38 3 23-12 37-36 38Z" fill="#719879" />
    <path d="M111 48C98 23 84 21 73 26c2 18 18 27 38 22Z" fill="#A8BE8B" />
    <ellipse cx="79" cy="119" rx="4" ry="6" fill="#664737" /><ellipse cx="139" cy="119" rx="4" ry="6" fill="#664737" />
    <path d="M99 129c5 8 15 8 20 0" stroke="#664737" strokeWidth="3.5" strokeLinecap="round" />
    <ellipse cx="64" cy="132" rx="10" ry="6" fill="#F78174" opacity=".6" /><ellipse cx="154" cy="132" rx="10" ry="6" fill="#F78174" opacity=".6" />
    <path d="m174 42 3-9 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="#F3BF62" />
    <path d="m37 56 2-6 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="#F3BF62" />
  </svg>
}
