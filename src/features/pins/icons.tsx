/** Icon catalogue for pin customization (Lucide). Stored by key in pins.icon. */
import {
  Beer, Briefcase, Camera, Coffee, Dumbbell, Flag, GraduationCap, Heart, Home, Landmark, MapPin,
  Mountain, Music, Palette, Plane, ShoppingBag, Star, Ticket, TreePine, Utensils, type LucideIcon,
} from 'lucide-react';

export const PIN_ICONS: Record<string, { label: string; Icon: LucideIcon }> = {
  'map-pin': { label: 'Pin', Icon: MapPin },
  ticket: { label: 'Ticket', Icon: Ticket },
  music: { label: 'Music', Icon: Music },
  utensils: { label: 'Food', Icon: Utensils },
  coffee: { label: 'Coffee', Icon: Coffee },
  beer: { label: 'Drinks', Icon: Beer },
  star: { label: 'Star', Icon: Star },
  heart: { label: 'Heart', Icon: Heart },
  home: { label: 'Home', Icon: Home },
  briefcase: { label: 'Work', Icon: Briefcase },
  camera: { label: 'Photo spot', Icon: Camera },
  landmark: { label: 'Landmark', Icon: Landmark },
  palette: { label: 'Art', Icon: Palette },
  mountain: { label: 'Outdoors', Icon: Mountain },
  tree: { label: 'Park', Icon: TreePine },
  plane: { label: 'Travel', Icon: Plane },
  shopping: { label: 'Shopping', Icon: ShoppingBag },
  dumbbell: { label: 'Fitness', Icon: Dumbbell },
  school: { label: 'School', Icon: GraduationCap },
  flag: { label: 'Flag', Icon: Flag },
};

export function iconFor(key: string | null | undefined, fallback: 'map-pin' | 'ticket'): LucideIcon {
  return (key && PIN_ICONS[key]?.Icon) || PIN_ICONS[fallback].Icon;
}
