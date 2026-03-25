"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, RefreshCw, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

// Dynamically import map to avoid SSR issues with Leaflet
const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import("react-leaflet").then((m) => m.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import("react-leaflet").then((m) => m.Popup),
  { ssr: false }
);

interface LocationWithProfile {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updated_at: string;
  profile: { id: string; full_name: string } | null;
}

export default function LiveMapView() {
  const supabase = createClient();
  const [locations, setLocations] = useState<LocationWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const iconRef = useRef<L.Icon | null>(null);

  // Import leaflet CSS and create icon on client side
  useEffect(() => {
    import("leaflet").then((L) => {
      iconRef.current = new L.Icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });
      setLeafletReady(true);
    });
  }, []);

  const loadLocations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/locations");
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to load locations");
      }
      const json = await res.json();
      setLocations(json.locations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLocations();

    // Real-time: refresh when locations change
    const sub = supabase
      .channel("admin-locations-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_locations" },
        () => loadLocations()
      )
      .subscribe();

    // Also poll every 60 seconds as a fallback
    const poll = setInterval(loadLocations, 60_000);

    return () => {
      supabase.removeChannel(sub);
      clearInterval(poll);
    };
  }, [loadLocations, supabase]);

  const timeAgo = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  // Calculate map center from locations or default to US center
  const center: [number, number] =
    locations.length > 0
      ? [
          locations.reduce((s, l) => s + l.latitude, 0) / locations.length,
          locations.reduce((s, l) => s + l.longitude, 0) / locations.length,
        ]
      : [39.8283, -98.5795];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-700">
            Employee Locations
          </h3>
          <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
            {locations.length} active
          </span>
        </div>
        <button
          onClick={loadLocations}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Map container */}
      <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm bg-white" style={{ height: 350 }}>
        {!leafletReady || isLoading ? (
          <div className="flex items-center justify-center h-full text-sm text-slate-400">
            Loading map...
          </div>
        ) : locations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-sm text-slate-400 gap-2">
            <MapPin className="h-8 w-8 text-slate-300" />
            <p>No active employee locations</p>
            <p className="text-[10px] text-slate-300">
              Employees&apos; locations appear when they&apos;re clocked in
            </p>
          </div>
        ) : (
          <MapContainer
            center={center}
            zoom={locations.length === 1 ? 14 : 10}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {locations.map((loc) => (
              <Marker
                key={loc.user_id}
                position={[loc.latitude, loc.longitude]}
                icon={iconRef.current ?? undefined}
              >
                <Popup>
                  <div className="text-sm">
                    <p className="font-semibold">
                      {loc.profile?.full_name ?? "Unknown"}
                    </p>
                    <p className="text-slate-500 text-xs mt-0.5">
                      Updated {timeAgo(loc.updated_at)}
                    </p>
                    {loc.accuracy && (
                      <p className="text-slate-400 text-xs">
                        ±{Math.round(loc.accuracy)}m accuracy
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* Employee location list */}
      {locations.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {locations.map((loc) => (
            <div
              key={loc.user_id}
              className="flex items-center justify-between rounded-lg bg-white border border-slate-100 px-3 py-2 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-medium text-slate-900">
                  {loc.profile?.full_name ?? "Unknown"}
                </span>
              </div>
              <span className="text-[10px] text-slate-400">
                {timeAgo(loc.updated_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
