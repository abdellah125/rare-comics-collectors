import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export function ShieldIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3l7.5 3v5.2c0 4.6-3.1 8.4-7.5 9.8-4.4-1.4-7.5-5.2-7.5-9.8V6L12 3z" />
      <path d="M9 12l2.1 2.1L15.4 9.8" />
    </svg>
  );
}

export function PressIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="4" width="18" height="5" rx="1.2" />
      <path d="M7 9v3M17 9v3" />
      <rect x="3" y="12" width="18" height="4" rx="1" />
      <path d="M5 19h14" />
    </svg>
  );
}

export function SearchIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

export function ScaleIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 4v16M7 20h10M4 8l8-2 8 2" />
      <path d="M4 8l-2.2 5a3 3 0 004.4 0L4 8zM20 8l-2.2 5a3 3 0 004.4 0L20 8z" />
    </svg>
  );
}

export function CameraIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 8.5A1.5 1.5 0 014.5 7h2.2l1.1-2h8.4l1.1 2h2.2A1.5 1.5 0 0121 8.5v9A1.5 1.5 0 0119.5 19h-15A1.5 1.5 0 013 17.5v-9z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  );
}

export function TruckIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 6.5h11v9H3zM14 10h3.6l2.4 3v2.5h-6z" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </svg>
  );
}

export function CartIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 4h2.2l2.1 10.4a1.6 1.6 0 001.6 1.3h8.3a1.6 1.6 0 001.6-1.2L20.5 7H6" />
      <circle cx="9.5" cy="19.5" r="1.4" />
      <circle cx="17.5" cy="19.5" r="1.4" />
    </svg>
  );
}

export function CloseIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function MenuIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function ChevronIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function PinIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  );
}

export function PhoneIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 4h3.2l1.6 4-2 1.4a12 12 0 005.8 5.8l1.4-2 4 1.6V18a2 2 0 01-2.2 2A15.8 15.8 0 013 6.2 2 2 0 015 4z" />
    </svg>
  );
}

export function MailIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </svg>
  );
}

export function ClockIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  );
}

export function StarIcon(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
      <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.95L12 2.6z" />
    </svg>
  );
}

export function TrashIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    </svg>
  );
}

export const serviceIcons = {
  shield: ShieldIcon,
  press: PressIcon,
  search: SearchIcon,
  scale: ScaleIcon,
  camera: CameraIcon,
  truck: TruckIcon,
};

/** WhatsApp glyph (filled, takes the text colour). */
export function WhatsAppIcon(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
      <path d="M12.04 2a9.9 9.9 0 00-8.46 15.06L2 22l5.08-1.53A9.93 9.93 0 1012.04 2zm0 1.8a8.13 8.13 0 11-4.2 15.1l-.3-.18-3 .9.92-2.92-.2-.31A8.13 8.13 0 0112.04 3.8zM8.6 7.2c-.2 0-.5.07-.77.36-.27.29-1.02 1-1.02 2.42 0 1.43 1.04 2.8 1.19 3 .15.19 2.02 3.2 4.98 4.37 2.46.97 2.96.78 3.5.73.53-.05 1.72-.7 1.96-1.38.24-.68.24-1.26.17-1.38-.07-.12-.27-.2-.56-.34-.3-.15-1.72-.85-1.99-.95-.27-.1-.46-.14-.66.15-.19.29-.75.95-.92 1.14-.17.2-.34.22-.63.07-.3-.14-1.23-.45-2.35-1.44a8.8 8.8 0 01-1.62-2.02c-.17-.3-.02-.45.13-.6.13-.13.29-.34.44-.51.14-.17.19-.29.29-.48.1-.2.05-.37-.02-.51-.08-.15-.65-1.6-.9-2.19-.24-.57-.48-.5-.66-.5l-.56-.01z" />
    </svg>
  );
}

export function ChatIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 5.5h16a1 1 0 011 1v10a1 1 0 01-1 1h-8.5L7 21v-3.5H4a1 1 0 01-1-1v-10a1 1 0 011-1z" />
      <path d="M7.5 10h9M7.5 13.5h5.5" />
    </svg>
  );
}

export function GlobeIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 3.9 5.2 3.9 8.5s-1.3 6.1-3.9 8.5c-2.6-2.4-3.9-5.2-3.9-8.5S9.4 5.9 12 3.5z" />
    </svg>
  );
}
