import { useState, useEffect, useMemo } from "react";

// ---------- Themes ----------
const THEMES = {
  light: {
    bg: "#F2F4F7",
    tile: "#FFFFFF",
    tileAlt: "#E9EDF2",
    ink: "#1B2029",
    sub: "#66707D",
    border: "#E3E7ED",
    accent: "#2547D0",
    accentInk: "#FFFFFF",
    accentSoft: "#E4EAFB",
    danger: "#C0392B",
    shadow: "0 1px 3px rgba(20,25,40,0.07)",
  },
  dark: {
    bg: "#0F1115",
    tile: "#1A1D24",
    tileAlt: "#23262F",
    ink: "#F2F4F8",
    sub: "#8B93A1",
    border: "#2A2E38",
    accent: "#6E8BFF",
    accentInk: "#0F1115",
    accentSoft: "#232B47",
    danger: "#FF8A7A",
    shadow: "0 1px 3px rgba(0,0,0,0.4)",
  },
};

const ENCODE = "'Encode Sans Semi Expanded', ui-sans-serif, system-ui, sans-serif";
const MONO = ENCODE;
const DISPLAY = ENCODE;

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Encode+Sans+Semi+Expanded:wght@400;500;600;700;800&display=swap');
* { font-family: 'Encode Sans Semi Expanded', ui-sans-serif, system-ui, sans-serif; }
`;

const DEFAULT_ROOMS = {
  "Hallway": ["Closet", "Console table", "Coat rack"],
  "Kitchen": ["Junk drawer", "Pantry", "Upper cabinets", "Lower cabinets", "Under sink"],
  "Living room": ["TV console", "Bookshelf", "Coffee table", "Sideboard", "Ottoman"],
  "Bedroom": ["Dresser", "Nightstand", "Closet", "Under bed"],
  "Nursery": ["Dresser", "Closet", "Changing table", "Toy bin"],
  "Bathroom": ["Vanity", "Medicine cabinet", "Linen closet"],
  "Office": ["Desk", "Filing cabinet", "Shelf"],
  "Storage": ["Shelving unit", "Bins", "Overhead rack"],
};

const ROOM_ICONS = {
  "Hallway": "🚪", "Kitchen": "🍳", "Living room": "🛋️", "Bedroom": "🛏️",
  "Nursery": "🧸", "Bathroom": "🛁", "Office": "🖥️", "Storage": "📦",
};

const POSITIONS = [
  "Top shelf", "Middle shelf", "Bottom shelf",
  "Top drawer", "Middle drawer", "Bottom drawer",
  "Left side", "Right side", "In the back", "Up front",
  "On top", "Underneath", "Hanging",
];

const STORAGE_KEY = "wdipi:data";
const uid = () => Math.random().toString(36).slice(2, 10);

function LabelPath({ parts, t, size = "sm" }) {
  const segs = parts.filter(Boolean);
  if (!segs.length) return null;
  const pad = size === "sm" ? "2px 7px" : "4px 10px";
  const fs = size === "sm" ? 10.5 : 12.5;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {segs.map((s, i) => (
        <span key={i} className="flex items-center gap-1">
          <span
            style={{
              background: t.accentSoft, color: t.accent, fontFamily: MONO,
              fontSize: fs, fontWeight: 600, letterSpacing: "0.05em",
              textTransform: "uppercase", padding: pad, borderRadius: 5, whiteSpace: "nowrap",
            }}
          >
            {s}
          </span>
          {i < segs.length - 1 && <span style={{ color: t.sub, fontSize: fs, fontFamily: MONO }}>›</span>}
        </span>
      ))}
    </div>
  );
}

function Chip({ label, active, onClick, t }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-sm transition-colors"
      style={{
        border: `1px solid ${active ? t.accent : t.border}`,
        background: active ? t.accent : t.tile,
        color: active ? t.accentInk : t.ink,
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

function Field({ label, t, children }) {
  return (
    <div className="mb-5">
      <div className="mb-2" style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: t.sub }}>
        {label}
      </div>
      {children}
    </div>
  );
}

export default function WhereDidIPutItBento() {
  const [theme, setTheme] = useState("light");
  const t = THEMES[theme];

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [customSpots, setCustomSpots] = useState({});
  const [customRooms, setCustomRooms] = useState([]);
  const [view, setView] = useState("home"); // home | room | add | detail
  const [activeRoom, setActiveRoom] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [query, setQuery] = useState("");

  const [fName, setFName] = useState("");
  const [fRoom, setFRoom] = useState(null);
  const [fSpot, setFSpot] = useState(null);
  const [fPos, setFPos] = useState(null);
  const [fContainer, setFContainer] = useState("");
  const [fNote, setFNote] = useState("");
  const [newRoom, setNewRoom] = useState("");
  const [newSpot, setNewSpot] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY);
        if (res?.value) {
          const data = JSON.parse(res.value);
          setItems(data.items || []);
          setCustomSpots(data.customSpots || {});
          setCustomRooms(data.customRooms || []);
          if (data.theme) setTheme(data.theme);
        }
      } catch (e) {
        // fresh start
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = async (over = {}) => {
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify({
        items, customSpots, customRooms, theme, ...over,
      }));
    } catch (e) { console.error("Save failed", e); }
  };

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    persist({ theme: next });
  };

  const allRooms = useMemo(() => [...Object.keys(DEFAULT_ROOMS), ...customRooms], [customRooms]);
  const spotsForRoom = (room) => [...(DEFAULT_ROOMS[room] || []), ...(customSpots[room] || [])];

  const roomCounts = useMemo(() => {
    const c = {};
    items.forEach((i) => { c[i.room] = (c[i.room] || 0) + 1; });
    return c;
  }, [items]);

  const sorted = useMemo(() => [...items].sort((a, b) => b.updatedAt - a.updatedAt), [items]);

  const searchResults = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    return sorted.filter((i) =>
      [i.name, i.room, i.spot, i.pos, i.container, i.note]
        .filter(Boolean).some((f) => f.toLowerCase().includes(q))
    );
  }, [sorted, query]);

  const roomItems = useMemo(
    () => (activeRoom ? sorted.filter((i) => i.room === activeRoom) : []),
    [sorted, activeRoom]
  );

  // Bento sizing: rooms with more items get bigger tiles
  const bentoRooms = useMemo(() => {
    const withCounts = allRooms.map((r) => ({ room: r, count: roomCounts[r] || 0 }));
    withCounts.sort((a, b) => b.count - a.count);
    return withCounts;
  }, [allRooms, roomCounts]);

  const resetForm = () => {
    setFName(""); setFRoom(null); setFSpot(null); setFPos(null);
    setFContainer(""); setFNote(""); setNewRoom(""); setNewSpot("");
    setEditingId(null);
  };

  const openAdd = (presetRoom = null) => { resetForm(); if (presetRoom) setFRoom(presetRoom); setView("add"); };

  const openEdit = (item) => {
    setEditingId(item.id);
    setFName(item.name); setFRoom(item.room); setFSpot(item.spot);
    setFPos(item.pos); setFContainer(item.container || ""); setFNote(item.note || "");
    setView("add");
  };

  const saveItem = async () => {
    if (!fName.trim() || !fRoom) return;
    let next;
    if (editingId) {
      next = items.map((i) => i.id === editingId
        ? { ...i, name: fName.trim(), room: fRoom, spot: fSpot, pos: fPos, container: fContainer.trim(), note: fNote.trim(), updatedAt: Date.now() }
        : i);
    } else {
      next = [{ id: uid(), name: fName.trim(), room: fRoom, spot: fSpot, pos: fPos, container: fContainer.trim(), note: fNote.trim(), updatedAt: Date.now() }, ...items];
    }
    setItems(next);
    try { await window.storage.set(STORAGE_KEY, JSON.stringify({ items: next, customSpots, customRooms, theme })); } catch (e) { console.error(e); }
    resetForm();
    setView("home");
  };

  const deleteItem = async (id) => {
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    try { await window.storage.set(STORAGE_KEY, JSON.stringify({ items: next, customSpots, customRooms, theme })); } catch (e) { console.error(e); }
    setView("home");
  };

  const addRoom = () => {
    const r = newRoom.trim();
    if (!r || allRooms.includes(r)) return;
    const nextRooms = [...customRooms, r];
    setCustomRooms(nextRooms);
    setFRoom(r);
    setNewRoom("");
    try { window.storage.set(STORAGE_KEY, JSON.stringify({ items, customSpots, customRooms: nextRooms, theme })); } catch (e) { console.error(e); }
  };

  const addSpot = () => {
    const s = newSpot.trim();
    if (!s || !fRoom || spotsForRoom(fRoom).includes(s)) return;
    const nextSpots = { ...customSpots, [fRoom]: [...(customSpots[fRoom] || []), s] };
    setCustomSpots(nextSpots);
    setFSpot(s);
    setNewSpot("");
    try { window.storage.set(STORAGE_KEY, JSON.stringify({ items, customSpots: nextSpots, customRooms, theme })); } catch (e) { console.error(e); }
  };

  const detail = items.find((i) => i.id === detailId);

  const tile = (extra = {}) => ({
    background: t.tile,
    border: `1px solid ${t.border}`,
    borderRadius: 20,
    boxShadow: t.shadow,
    ...extra,
  });

  const inputStyle = {
    border: `1px solid ${t.border}`,
    background: theme === "dark" ? t.tileAlt : t.tile,
    color: t.ink,
  };

  const ItemCard = ({ i }) => (
    <button
      onClick={() => { setDetailId(i.id); setView("detail"); }}
      className="w-full p-4 text-left"
      style={tile()}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="font-semibold" style={{ fontFamily: DISPLAY, fontSize: 15.5 }}>{i.name}</span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: t.sub }}>{new Date(i.updatedAt).toLocaleDateString()}</span>
      </div>
      <LabelPath parts={[i.room, i.spot, i.pos, i.container]} t={t} />
      {i.note && <div className="mt-1.5 text-sm" style={{ color: t.sub }}>{i.note}</div>}
    </button>
  );

  return (
    <div style={{ background: t.bg, minHeight: "100vh", color: t.ink, transition: "background 0.25s, color 0.25s" }}>
      <style>{FONT_IMPORT}</style>
      <div className="mx-auto max-w-xl px-4 pb-24 pt-6">

        {/* Header */}
        <div className="mb-5 flex items-end justify-between">
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: t.accent, textTransform: "uppercase" }}>
              Household index
            </div>
            <h1 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 26, lineHeight: 1.15 }}>
              Where did I put it?
            </h1>
          </div>
          <button
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="rounded-full p-2.5 text-lg"
            style={tile({ borderRadius: 999 })}
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center" style={{ color: t.sub, fontFamily: MONO, fontSize: 13 }}>
            Opening drawers…
          </div>
        ) : view === "home" ? (
          <>
            {/* Search */}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items, boxes, shelves…"
              className="mb-4 w-full rounded-2xl px-4 py-3 text-base outline-none"
              style={inputStyle}
            />

            {searchResults ? (
              searchResults.length === 0 ? (
                <div className="p-8 text-center" style={tile()}>
                  <div className="font-semibold" style={{ fontFamily: DISPLAY }}>No matches</div>
                  <div className="mt-1 text-sm" style={{ color: t.sub }}>
                    Try a different word — maybe you filed it under the box, not the item.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {searchResults.map((i) => <ItemCard key={i.id} i={i} />)}
                </div>
              )
            ) : (
              <>
                {/* Bento grid */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Stat tile */}
                  <div className="p-4" style={tile({ background: t.accent, border: "none" })}>
                    <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 34, color: t.accentInk, lineHeight: 1 }}>
                      {items.length}
                    </div>
                    <div className="mt-1" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: t.accentInk, opacity: 0.75 }}>
                      Things stashed
                    </div>
                  </div>

                  {/* Add tile */}
                  <button onClick={() => openAdd()} className="flex flex-col items-start justify-between p-4 text-left" style={tile()}>
                    <div style={{ fontSize: 24 }}>➕</div>
                    <div className="font-semibold" style={{ fontFamily: DISPLAY, fontSize: 15 }}>Stash something</div>
                  </button>

                  {/* Room tiles — busiest rooms span both columns */}
                  {bentoRooms.map(({ room, count }, idx) => {
                    const big = count > 0 && idx < 2;
                    return (
                      <button
                        key={room}
                        onClick={() => { setActiveRoom(room); setView("room"); }}
                        className={`${big ? "col-span-2 flex-row items-center justify-between" : "flex-col items-start justify-between"} flex p-4 text-left`}
                        style={tile({ minHeight: big ? 0 : 96 })}
                      >
                        <div className={big ? "flex items-center gap-3" : ""}>
                          <div style={{ fontSize: big ? 26 : 22 }}>{ROOM_ICONS[room] || "🏠"}</div>
                          <div className={big ? "" : "mt-2"}>
                            <div className="font-semibold" style={{ fontFamily: DISPLAY, fontSize: 15 }}>{room}</div>
                            {big && count > 0 && (
                              <div className="mt-0.5 text-xs" style={{ color: t.sub }}>
                                Latest: {sorted.find((i) => i.room === room)?.name}
                              </div>
                            )}
                          </div>
                        </div>
                        <div
                          className="rounded-full px-2 py-0.5"
                          style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, background: count ? t.accentSoft : t.tileAlt, color: count ? t.accent : t.sub }}
                        >
                          {count}
                        </div>
                      </button>
                    );
                  })}

                  {/* Recent tile */}
                  {sorted.length > 0 && (
                    <div className="col-span-2 p-4" style={tile()}>
                      <div className="mb-3" style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: t.sub }}>
                        Recently stashed
                      </div>
                      <div className="flex flex-col gap-3">
                        {sorted.slice(0, 3).map((i) => (
                          <button key={i.id} onClick={() => { setDetailId(i.id); setView("detail"); }} className="text-left">
                            <div className="mb-1 font-semibold" style={{ fontFamily: DISPLAY, fontSize: 14 }}>{i.name}</div>
                            <LabelPath parts={[i.room, i.spot, i.pos, i.container]} t={t} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {items.length === 0 && (
                  <div className="mt-3 p-6 text-center" style={tile({ border: `1px dashed ${t.border}`, boxShadow: "none" })}>
                    <div className="text-sm" style={{ color: t.sub }}>
                      Log the passport, the spare keys, the HDMI cables — future you says thanks.
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        ) : view === "room" ? (
          <>
            <button onClick={() => setView("home")} className="mb-4 text-sm font-semibold" style={{ color: t.accent, fontFamily: DISPLAY }}>
              ← All rooms
            </button>
            <div className="mb-4 flex items-center justify-between">
              <h2 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 21 }}>
                {ROOM_ICONS[activeRoom] || "🏠"} {activeRoom}
              </h2>
              <button
                onClick={() => openAdd(activeRoom)}
                className="rounded-xl px-3 py-2 text-sm font-semibold"
                style={{ background: t.accent, color: t.accentInk, fontFamily: DISPLAY }}
              >
                + Stash here
              </button>
            </div>
            {roomItems.length === 0 ? (
              <div className="p-8 text-center" style={tile()}>
                <div className="text-sm" style={{ color: t.sub }}>Nothing logged in the {activeRoom.toLowerCase()} yet.</div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {roomItems.map((i) => <ItemCard key={i.id} i={i} />)}
              </div>
            )}
          </>
        ) : view === "add" ? (
          <div className="p-5" style={tile()}>
            <Field label="What is it?" t={t}>
              <input value={fName} onChange={(e) => setFName(e.target.value)}
                placeholder="e.g. Passport, spare Fire Stick remote"
                className="w-full rounded-xl px-3 py-2.5 outline-none" style={inputStyle} autoFocus />
            </Field>

            <Field label="Room" t={t}>
              <div className="flex flex-wrap gap-2">
                {allRooms.map((r) => (
                  <Chip key={r} label={r} active={fRoom === r} onClick={() => { setFRoom(r); setFSpot(null); }} t={t} />
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input value={newRoom} onChange={(e) => setNewRoom(e.target.value)} placeholder="Add a room…"
                  className="flex-1 rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} />
                <button onClick={addRoom} className="rounded-xl px-3 text-sm font-semibold" style={{ border: `1px solid ${t.border}`, color: t.ink }}>Add</button>
              </div>
            </Field>

            {fRoom && (
              <Field label={`Where in the ${fRoom.toLowerCase()}?`} t={t}>
                <div className="flex flex-wrap gap-2">
                  {spotsForRoom(fRoom).map((s) => (
                    <Chip key={s} label={s} active={fSpot === s} onClick={() => setFSpot(fSpot === s ? null : s)} t={t} />
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input value={newSpot} onChange={(e) => setNewSpot(e.target.value)} placeholder="Add furniture or a spot…"
                    className="flex-1 rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} />
                  <button onClick={addSpot} className="rounded-xl px-3 text-sm font-semibold" style={{ border: `1px solid ${t.border}`, color: t.ink }}>Add</button>
                </div>
              </Field>
            )}

            {fSpot && (
              <Field label="Exactly where?" t={t}>
                <div className="flex flex-wrap gap-2">
                  {POSITIONS.map((p) => (
                    <Chip key={p} label={p} active={fPos === p} onClick={() => setFPos(fPos === p ? null : p)} t={t} />
                  ))}
                </div>
              </Field>
            )}

            <Field label="In a container? (optional)" t={t}>
              <input value={fContainer} onChange={(e) => setFContainer(e.target.value)}
                placeholder='e.g. "the blue box", "shoebox marked CABLES"'
                className="w-full rounded-xl px-3 py-2.5 outline-none" style={inputStyle} />
            </Field>

            <Field label="Note (optional)" t={t}>
              <input value={fNote} onChange={(e) => setFNote(e.target.value)}
                placeholder="e.g. behind the winter coats"
                className="w-full rounded-xl px-3 py-2.5 outline-none" style={inputStyle} />
            </Field>

            {(fRoom || fContainer) && (
              <div className="mb-5 rounded-2xl p-3" style={{ background: t.tileAlt, border: `1px dashed ${t.border}` }}>
                <div className="mb-1.5" style={{ fontFamily: MONO, fontSize: 10, color: t.sub, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  The label
                </div>
                <LabelPath parts={[fRoom, fSpot, fPos, fContainer]} t={t} size="md" />
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={saveItem} disabled={!fName.trim() || !fRoom}
                className="flex-1 rounded-xl py-3 font-semibold disabled:opacity-40"
                style={{ background: t.accent, color: t.accentInk, fontFamily: DISPLAY }}>
                {editingId ? "Update location" : "Save the spot"}
              </button>
              <button onClick={() => { resetForm(); setView("home"); }}
                className="rounded-xl px-4 font-semibold"
                style={{ border: `1px solid ${t.border}`, color: t.ink, fontFamily: DISPLAY }}>
                Cancel
              </button>
            </div>
          </div>
        ) : detail ? (
          <div className="p-6" style={tile()}>
            <h2 className="mb-3" style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 22 }}>{detail.name}</h2>
            <LabelPath parts={[detail.room, detail.spot, detail.pos, detail.container]} t={t} size="md" />
            {detail.note && <p className="mt-3 text-sm" style={{ color: t.sub }}>{detail.note}</p>}
            <p className="mt-3" style={{ fontFamily: MONO, fontSize: 11, color: t.sub }}>
              Last updated {new Date(detail.updatedAt).toLocaleString()}
            </p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => openEdit(detail)}
                className="flex-1 rounded-xl py-2.5 font-semibold"
                style={{ background: t.accent, color: t.accentInk, fontFamily: DISPLAY }}>
                It moved — update
              </button>
              <button onClick={() => deleteItem(detail.id)}
                className="rounded-xl px-4 py-2.5 font-semibold"
                style={{ border: `1px solid ${t.border}`, color: t.danger, fontFamily: DISPLAY }}>
                Delete
              </button>
            </div>
            <button onClick={() => setView("home")}
              className="mt-3 w-full rounded-xl py-2.5 font-semibold"
              style={{ border: `1px solid ${t.border}`, color: t.ink, fontFamily: DISPLAY }}>
              Back
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
