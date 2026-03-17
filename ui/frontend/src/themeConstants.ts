export const ACCENT_COLORS = [
  { id: "blue", color: "#007AFF", name: "Blue", ring: "ring-[#007AFF]" },
  { id: "sky", color: "#0ea5e9", name: "Sky", ring: "ring-sky-500" },
  { id: "green", color: "#22c55e", name: "Green", ring: "ring-green-500" },
  { id: "pink", color: "#ec4899", name: "Pink", ring: "ring-pink-500" },
  {
    id: "orange",
    color: "#f97316",
    name: "Orange",
    ring: "ring-orange-500",
  },
  {
    id: "purple",
    color: "#a855f7",
    name: "Purple",
    ring: "ring-purple-500",
  },
  { id: "red", color: "#ef4444", name: "Red", ring: "ring-red-500" },
  { id: "stone", color: "#78716c", name: "Stone", ring: "ring-stone-500" },
  { id: "gold", color: "#eab308", name: "Gold", ring: "ring-yellow-500" },
];

export type Theme = {
  id: string;
  name: string;
  bg: string;
  headerBg: string;
  text: string;
  subText: string;
  panelBg: string;
  panelCard: string;
  inputAreaBg: string;
  inputField: string;
  bubbleOther: string;
  border: string;
  iconBg: string;
  iconText: string;
  ghostHover: string;
  deviceItemBg: string;
  isDark: boolean;
  previewColor: string;
  metaColor: string;
  accentColor?: string;
};

export const THEME_PRESETS: Theme[] = [
  {
    id: "classic",
    name: "Classic",
    bg: "bg-[#effcf6]",
    headerBg: "bg-[#effcf6]/95 border-emerald-100",
    text: "text-emerald-950",
    subText: "text-emerald-700/70",
    panelBg: "bg-[#f4fdf8] border-emerald-100",
    panelCard: "bg-white border-emerald-100",
    inputAreaBg: "bg-[#f4fdf8] border-emerald-100",
    inputField: "bg-white text-emerald-950 focus:bg-white",
    bubbleOther: "bg-white border-emerald-100 text-emerald-950",
    border: "border-emerald-100",
    iconBg: "bg-emerald-100",
    iconText: "text-emerald-600",
    ghostHover: "hover:bg-emerald-100 text-emerald-700",
    deviceItemBg: "bg-[#f4fdf8] border-emerald-100",
    isDark: false,
    previewColor: "#effcf6",
    metaColor: "#f4fdf8",
  },

  {
    id: "day",
    name: "Day",
    bg: "bg-[#F2F2F7]",
    headerBg: "bg-[#F2F2F7]/95 border-gray-200/50",
    text: "text-gray-900",
    subText: "text-gray-500",
    panelBg: "bg-white border-gray-200",
    panelCard: "bg-white border-gray-100",
    inputAreaBg: "bg-white border-gray-200",
    inputField: "bg-gray-100 hover:bg-gray-50 focus:bg-white",
    bubbleOther: "bg-white border-gray-200 text-gray-900",
    border: "border-gray-200",
    iconBg: "bg-gray-100",
    iconText: "text-gray-500",
    ghostHover: "hover:bg-gray-200 text-gray-600",
    deviceItemBg: "bg-gray-50 border-gray-100",
    isDark: false,
    previewColor: "#bfdbfe",
    metaColor: "#ffffff",
  },

  {
    id: "tinted",
    name: "Tinted",
    bg: "bg-[#161b16]",
    headerBg: "bg-[#161b16]/95 border-[#232e25]",
    text: "text-emerald-50",
    subText: "text-emerald-400/60",
    panelBg: "bg-[#1c241d] border-[#232e25]",
    panelCard: "bg-[#121712] border-[#232e25]",
    inputAreaBg: "bg-[#1c241d] border-[#232e25]",
    inputField: "bg-[#2A362C] text-emerald-50 focus:bg-[#344237]",
    bubbleOther: "bg-[#1c241d] border-[#232e25] text-emerald-50",
    border: "border-[#232e25]",
    iconBg: "bg-[#232e25]",
    iconText: "text-emerald-400",
    ghostHover: "hover:bg-[#232e25] text-emerald-400",
    deviceItemBg: "bg-[#1c241d] border-[#232e25]",
    isDark: true,
    previewColor: "#1c241d",
    metaColor: "#1c241d",
  },

  {
    id: "night",
    name: "Night",
    bg: "bg-[#0f172a]",
    headerBg: "bg-[#0f172a]/95 border-slate-800",
    text: "text-slate-100",
    subText: "text-slate-400",
    panelBg: "bg-[#1e293b] border-slate-700",
    panelCard: "bg-[#0f172a] border-slate-700",
    inputAreaBg: "bg-[#1e293b] border-slate-700",
    inputField: "bg-[#334155] text-white focus:bg-[#475569]",
    bubbleOther: "bg-[#1e293b] border-slate-700 text-slate-100",
    border: "border-slate-700",
    iconBg: "bg-slate-800",
    iconText: "text-slate-400",
    ghostHover: "hover:bg-slate-800 text-slate-400",
    deviceItemBg: "bg-slate-800/50 border-slate-700",
    isDark: true,
    previewColor: "#334155",
    metaColor: "#1e293b",
  },

  /* ===================== NEW THEMES ===================== */

  {
    id: "arctic",
    name: "Arctic",
    bg: "bg-[#f8fafc]",
    headerBg: "bg-[#f8fafc]/95 border-sky-100",
    text: "text-slate-900",
    subText: "text-slate-500",
    panelBg: "bg-white border-sky-100",
    panelCard: "bg-white border-sky-100",
    inputAreaBg: "bg-white border-sky-100",
    inputField: "bg-sky-50 focus:bg-white",
    bubbleOther: "bg-white border-sky-100 text-slate-900",
    border: "border-sky-100",
    iconBg: "bg-sky-100",
    iconText: "text-sky-600",
    ghostHover: "hover:bg-sky-100 text-sky-600",
    deviceItemBg: "bg-sky-50 border-sky-100",
    isDark: false,
    previewColor: "#e0f2fe",
    metaColor: "#ffffff",
  },

  {
    id: "sand",
    name: "Sand",
    bg: "bg-[#faf8f5]",
    headerBg: "bg-[#faf8f5]/95 border-amber-100",
    text: "text-amber-950",
    subText: "text-amber-700/70",
    panelBg: "bg-[#fffaf0] border-amber-100",
    panelCard: "bg-white border-amber-100",
    inputAreaBg: "bg-[#fffaf0] border-amber-100",
    inputField: "bg-white focus:bg-white",
    bubbleOther: "bg-white border-amber-100 text-amber-950",
    border: "border-amber-100",
    iconBg: "bg-amber-100",
    iconText: "text-amber-700",
    ghostHover: "hover:bg-amber-100 text-amber-700",
    deviceItemBg: "bg-[#fffaf0] border-amber-100",
    isDark: false,
    previewColor: "#fde68a",
    metaColor: "#fffaf0",
  },

  {
    id: "rose",
    name: "Rose",
    bg: "bg-[#fff1f2]",
    headerBg: "bg-[#fff1f2]/95 border-rose-200",
    text: "text-rose-950",
    subText: "text-rose-700/70",
    panelBg: "bg-white border-rose-200",
    panelCard: "bg-white border-rose-200",
    inputAreaBg: "bg-white border-rose-200",
    inputField: "bg-rose-50 focus:bg-white",
    bubbleOther: "bg-white border-rose-200 text-rose-950",
    border: "border-rose-200",
    iconBg: "bg-rose-100",
    iconText: "text-rose-600",
    ghostHover: "hover:bg-rose-100 text-rose-600",
    deviceItemBg: "bg-rose-50 border-rose-200",
    isDark: false,
    previewColor: "#fecdd3",
    metaColor: "#ffffff",
  },

  {
    id: "graphite",
    name: "Graphite",
    bg: "bg-[#18181b]",
    headerBg: "bg-[#18181b]/95 border-zinc-700",
    text: "text-zinc-100",
    subText: "text-zinc-400",
    panelBg: "bg-[#27272a] border-zinc-700",
    panelCard: "bg-[#18181b] border-zinc-700",
    inputAreaBg: "bg-[#27272a] border-zinc-700",
    inputField: "bg-[#3f3f46] text-white focus:bg-[#52525b]",
    bubbleOther: "bg-[#27272a] border-zinc-700 text-zinc-100",
    border: "border-zinc-700",
    iconBg: "bg-zinc-800",
    iconText: "text-zinc-400",
    ghostHover: "hover:bg-zinc-800 text-zinc-400",
    deviceItemBg: "bg-zinc-800/50 border-zinc-700",
    isDark: true,
    previewColor: "#3f3f46",
    metaColor: "#27272a",
  },

  {
    id: "midnightBlue",
    name: "Midnight Blue",
    bg: "bg-[#020617]",
    headerBg: "bg-[#020617]/95 border-blue-900",
    text: "text-blue-100",
    subText: "text-blue-400",
    panelBg: "bg-[#020b26] border-blue-900",
    panelCard: "bg-[#020617] border-blue-900",
    inputAreaBg: "bg-[#020b26] border-blue-900",
    inputField: "bg-[#081a40] text-white focus:bg-[#0a2463]",
    bubbleOther: "bg-[#020b26] border-blue-900 text-blue-100",
    border: "border-blue-900",
    iconBg: "bg-blue-900",
    iconText: "text-blue-400",
    ghostHover: "hover:bg-blue-900 text-blue-400",
    deviceItemBg: "bg-blue-950/50 border-blue-900",
    isDark: true,
    previewColor: "#081a40",
    metaColor: "#020b26",
  },
];
