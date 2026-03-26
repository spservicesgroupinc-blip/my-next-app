"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, RefreshCw, AlertCircle, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

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

interface ClockedInEmployee {
  id: string;
  user_id: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  updated_at: string | null;
  profile: { id: string; full_name: string } | null;
  job_name: string | null;
  clock_in: string | null;
}

function elapsed(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
}

export default function LiveMapView() {
  const supabase = createClient();
  const [employees, setEmployees] = useState<ClockedInEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [, setTick] = useState(0);
  const iconRef = useRef<L.Icon | null>(null);

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

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/locations");
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to load");
      }
      const json = await res.json();
      setEmployees(json.locations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    // Realtime: refresh when shifts or locations change
    const sub = supabase
      .channel("admin-locations-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_locations" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries" }, load)
      .subscribe();

    // Tick every minute to update elapsed times
    const tick = setInterval(() => setTick((t) => t + 1), 60_000);

    return () => {
      supabase.removeChannel(sub);
      clearInterval(tick);
    };
  }, [load, supabase]);

  const withGPS = employees.filter((e) => e.latitude !== null && e.longitude !== null);
  const noGPS = employees.filter((e) => e.latitude === null || e.longitude === null);

  const center: [number, number] =
    withGPS.length > 0
      ? [
          withGPS.reduce((s, l) => s + l.latitude!, 0) / withGPS.length,
          withGPS.reduce((s, l) => s + l.longitude!, 0) / withGPS.length,
        ]
      : [39.8283, -98.5795];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-sm font-semibold text-slate-800">
            {isLoading ? "Loading…" : `${employees.length} Clocked In`}
          </span>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-orange-600 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 mx-4 mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex-shrink-0">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Map */}
      <div className="flex-1 min-h-0">
        {!leafletReady || isLoading ? (
          <div className="flex items-center justify-center h-full text-sm text-slate-400">
            Loading map…
          </div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
            <MapPin className="h-10 w-10 text-slate-200" />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-500">No one clocked in</p>
              <p className="text-xs text-slate-400 mt-0.5">Employees will appear here when they clock in</p>
            </div>
          </div>
        ) : withGPS.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
            <MapPin className="h-10 w-10 text-slate-200" />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-500">No GPS location available</p>
              <p className="text-xs text-slate-400 mt-0.5">Employees haven&apos;t shared their location yet</p>
            </div>
          </div>
        ) : (
          <MapContainer
            center={center}
            zoom={withGPS.length === 1 ? 14 : 10}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {withGPS.map((emp) => (
              <Marker
                key={emp.user_id}
                position={[emp.latitude!, emp.longitude!]}
                icon={iconRef.current ?? undefined}
              >
                <Popup>
                  <div className="text-sm min-w-[140px]">
                    <p className="font-semibold text-slate-900">
                      {emp.profile?.full_name ?? "Unknown"}
                    </p>
                    {emp.job_name && (
                      <p className="text-slate-600 text-xs mt-0.5">{emp.job_name}</p>
                    )}
                    {emp.clock_in && (
                      <p className="text-emerald-600 text-xs mt-0.5 font-medium">
                        {elapsed(emp.clock_in)} on shift
                      </p>
                    )}
                    {emp.accuracy && (
                      <p className="text-slate-400 text-xs mt-0.5">
                        ±{Math.round(emp.accuracy)}m accuracy
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* Roster below the map */}
      {employees.length > 0 && (
        <div className="flex-shrink-0 border-t border-slate-100 bg-white divide-y divide-slate-50 max-h-48 overflow-y-auto">
          {employees.map((emp) => (
            <div key={emp.user_id} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {emp.profile?.full_name ?? "Unknown"}
                  </p>
                  {emp.job_name && (
                    <p className="text-xs text-slate-500">{emp.job_name}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                {emp.latitude === null && (
                  <span className="text-[10px] text-amber-500 font-medium">No GPS</span>
                )}
                {emp.clock_in && (
                  <span className="flex items-center gap-0.5 font-mono text-emerald-600">
                    <Clock className="h-3 w-3" />
                    {elapsed(emp.clock_in)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
