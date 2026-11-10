import {
  ArrowLeftRight, BadgeDollarSign, Barcode, Bell, Building2, Calendar, Camera, CircleUser, ClipboardList, Clock, Factory, Flame, Flashlight,
  FlashlightOff, Landmark, Layers, Leaf, LogOut, Menu, Moon, Package, Pencil, Printer, Receipt, RefreshCw, ScanBarcode, ShoppingBag, Sparkles,
  Store, Sun, Tag, Trash2, TrendingUp, Undo2, Wifi, WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { cx } from '@/lib/cx';

/** Built-in starter set (same names and paths as design-system/components). */
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  cart: 'M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9 20.5h.01M17 20.5h.01',
  truck: 'M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.7l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.3 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 20.9 10H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-5-5',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5 10 17 19 7',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  filter: 'M3 5h18l-7 8.5V19l-4 2v-7.5z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M8 12.5l3 3 5-6',
  x: 'M6 6l12 12M18 6 6 18',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
} as const;

/** Extra names for the ERP build, drawn with Lucide at the same 1.75 stroke (the design system's approved full set). */
const LUCIDE = {
  scan: ScanBarcode,
  barcode: Barcode,
  receipt: Receipt,
  undo: Undo2,
  clipboard: ClipboardList,
  calendar: Calendar,
  factory: Factory,
  flame: Flame,
  store: Store,
  building: Building2,
  tag: Tag,
  printer: Printer,
  sun: Sun,
  moon: Moon,
  menu: Menu,
  logout: LogOut,
  user: CircleUser,
  wifi: Wifi,
  wifiOff: WifiOff,
  bell: Bell,
  bag: ShoppingBag,
  trendingUp: TrendingUp,
  layers: Layers,
  money: BadgeDollarSign,
  bank: Landmark,
  package: Package,
  swap: ArrowLeftRight,
  refresh: RefreshCw,
  trash: Trash2,
  edit: Pencil,
  camera: Camera,
  torch: Flashlight,
  torchOff: FlashlightOff,
  leaf: Leaf,
  clock: Clock,
  sparkles: Sparkles,
} as const satisfies Record<string, LucideIcon>;

type CoreIconName = keyof typeof PATHS;
type ExtraIconName = keyof typeof LUCIDE;

/** The 23 names from the design system's index.d.ts, plus the extra Lucide names above. */
export type IconName = CoreIconName | ExtraIconName;
export interface IconProps {
  name: IconName;
  size?: number;
  label?: string;
  className?: string;
}

export function Icon({ name, size = 18, label, className }: IconProps) {
  const a11y = label ? ({ role: 'img', 'aria-label': label } as const) : ({ 'aria-hidden': true } as const);
  if (name in LUCIDE) {
    const L = LUCIDE[name as ExtraIconName];
    return (
      <L
        className={cx('gz-icon', className)}
        size={size}
        strokeWidth={1.75}
        role={a11y.role}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      />
    );
  }
  return (
    <svg
      className={cx('gz-icon', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
    >
      <path d={PATHS[name as CoreIconName] ?? PATHS.box} />
    </svg>
  );
}
