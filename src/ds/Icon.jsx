import {
  Flame, Feather, Heart, Infinity as InfinityIcon, Menu, X, Ear, BookOpen, Book, History, Lock, Unlock,
  Check, CheckCircle2, Circle, Volume2, VolumeX, Play, Sparkles, Clock, Calendar, Shuffle, ChevronRight,
  RotateCcw, AlertTriangle, Shield, Target, Trophy, Bell, Square,
} from 'lucide-react';

// Lucide 0.454, gebündelt statt per CDN — nur die Icons, die das Design nutzt.
const ICONS = {
  flame: Flame, feather: Feather, heart: Heart, infinity: InfinityIcon, menu: Menu, x: X, ear: Ear,
  'book-open': BookOpen, book: Book, history: History, lock: Lock, unlock: Unlock, check: Check,
  'check-circle-2': CheckCircle2, circle: Circle, 'volume-2': Volume2, 'volume-x': VolumeX, play: Play,
  sparkles: Sparkles, clock: Clock, calendar: Calendar, shuffle: Shuffle, 'chevron-right': ChevronRight,
  'rotate-ccw': RotateCcw, 'alert-triangle': AlertTriangle, shield: Shield, target: Target, trophy: Trophy,
  bell: Bell, square: Square,
};

export function Icon({ name, size = 24, strokeWidth = 2, color = 'currentColor', fill = 'none', title, style, ...rest }) {
  const Cmp = ICONS[name] || Circle;
  return (
    <span role={title ? 'img' : 'presentation'} aria-label={title} aria-hidden={title ? undefined : true}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, color, flex: '0 0 auto', ...style }} {...rest}>
      <Cmp size={size} strokeWidth={strokeWidth} fill={fill} absoluteStrokeWidth={false} />
    </span>
  );
}
