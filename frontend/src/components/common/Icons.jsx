// 선 아이콘 모음. 색은 currentColor를 따라간다
function Svg({ size = 24, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p) => (
  <Svg {...p}>
    <path d="M4 11 12 4l8 7" />
    <path d="M6 10v9h12v-9" />
  </Svg>
);

export const CalendarIcon = (p) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Svg>
);

export const MicIcon = (p) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M6 11a6 6 0 0 0 12 0M12 17v4" />
  </Svg>
);

export const ListIcon = (p) => (
  <Svg {...p}>
    <path d="M6 8h12M6 12h12M6 16h12" />
  </Svg>
);

export const ChartIcon = (p) => (
  <Svg {...p}>
    <path d="M7 19v-5M12 19V8M17 19v-8" />
  </Svg>
);

export const BellIcon = (p) => (
  <Svg {...p}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
    <path d="M10 21h4" />
  </Svg>
);

export const UserIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
  </Svg>
);

export const ClockIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" />
  </Svg>
);

export const ChevronIcon = (p) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

export const CheckIcon = (p) => (
  <Svg {...p}>
    <path d="m5 12 5 5 9-10" />
  </Svg>
);

export const EditIcon = (p) => (
  <Svg {...p}>
    <path d="m5 19 1-4L16 5l3 3L9 18z" />
    <path d="M4 21h16" />
  </Svg>
);

export const TrashIcon = (p) => (
  <Svg {...p}>
    <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />
    <path d="m10 11 4 5m0-5-4 5" />
  </Svg>
);

export const NoteIcon = (p) => (
  <Svg {...p}>
    <rect x="5" y="4" width="14" height="16" rx="2" />
    <path d="M9 9h6M9 13h6" />
  </Svg>
);

export const ArrowRightIcon = (p) => (
  <Svg {...p}>
    <path d="M5 12h14m-5-6 6 6-6 6" />
  </Svg>
);

export const RepeatIcon = (p) => (
  <Svg {...p}>
    <path d="M17 4l3 3-3 3M20 7H9a5 5 0 0 0-5 5M7 20l-3-3 3-3M4 17h11a5 5 0 0 0 5-5" />
  </Svg>
);

export const SparkIcon = (p) => (
  <Svg {...p}>
    <path d="M10 4v5M7.5 6.5h5M16 11l1.2 3.3 3.3 1.2-3.3 1.2L16 20l-1.2-3.3-3.3-1.2 3.3-1.2zM6 14l.8 2.2L9 17l-2.2.8L6 20l-.8-2.2L3 17l2.2-.8z" />
  </Svg>
);

export const PlusCircleIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v8M8 12h8" />
  </Svg>
);

export const KeyboardIcon = (p) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M18 10h.01M7 14h10" />
  </Svg>
);
