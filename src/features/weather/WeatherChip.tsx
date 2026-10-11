/**
 * Small status chip on the map for the weather effect: says honestly what is
 * shown and where it comes from — live conditions (with Open-Meteo
 * attribution), a manual choice, or that live weather couldn't be loaded.
 * Opens Settings → Map animations & weather. Hidden when weather is off.
 */
import { Link } from 'react-router-dom';
import { Cloud, CloudFog, CloudLightning, CloudOff, CloudRain, CloudSun, Loader2, Snowflake, Sun } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { useWeather, WEATHER_LABEL, type WeatherKind } from './weather';

const ICON: Record<WeatherKind, typeof Sun> = {
  clear: Sun, 'partly-cloudy': CloudSun, cloudy: Cloud, rain: CloudRain, storm: CloudLightning, fog: CloudFog, snow: Snowflake,
};

export function WeatherChip({ className }: { className?: string }) {
  const { prefs, state, live } = useWeather();
  if (prefs.mode === 'off') return null;
  let Icon = state ? ICON[state.kind] : CloudOff;
  let text: string;
  let title: string;
  if (prefs.mode === 'manual') {
    text = `${WEATHER_LABEL[prefs.manual]} (manual)`;
    title = 'Manual weather effect — not the real weather. Change it in Settings.';
  } else if (live.isError) {
    text = 'Live weather unavailable';
    title = `${live.error instanceof Error ? live.error.message : 'Live weather couldn’t be loaded.'} No weather effect is shown until it can update.`;
  } else if (!live.data) {
    Icon = Loader2;
    text = 'Loading weather…';
    title = 'Fetching current conditions for the map centre.';
  } else {
    const t = live.data.temperatureC;
    text = `${WEATHER_LABEL[live.data.state.kind]}${t != null ? ` · ${Math.round(t)}°C` : ''}`;
    title = `Live conditions near the map centre (${live.data.latitude.toFixed(2)}, ${live.data.longitude.toFixed(2)})${live.isFetching ? ', updating…' : ''}. Weather data by Open-Meteo.com (CC BY 4.0).`;
  }
  return (
    <Link to="/settings/animations" title={title} aria-label={`Weather: ${text}. ${title}`} data-testid="weather-chip"
      className={cn('pointer-events-auto flex h-9 items-center gap-1.5 rounded-xl bg-white/95 px-2.5 text-xs font-medium text-neutral-800 shadow-panel ring-1 ring-black/5 hover:bg-white', className)}>
      <Icon className={cn('size-4', Icon === Loader2 && 'animate-spin')} aria-hidden />
      <span className="max-w-[170px] truncate">{text}</span>
      {prefs.mode === 'auto' && live.data && !live.isError && <span className="text-[10px] font-normal text-neutral-500">Open-Meteo</span>}
    </Link>
  );
}
