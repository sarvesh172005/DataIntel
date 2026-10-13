import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getProjects, createProject, getSessions, createSession, deleteSession, getDatasets, deleteDataset } from "../services/api";
import UploadDataset from "./UploadDataset";
import { PlusCircle, MessageSquare, Trash2, Database, CheckCircle, XCircle, AlertTriangle, X, Eye, EyeOff, ShieldCheck } from "lucide-react";

import toast from "react-hot-toast";

/* ─── Inline Confirm Row ────────────────────────────────── */
function InlineConfirm({ message, onConfirm, onCancel }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-red-950/60 border border-red-500/30 rounded-lg text-xs text-red-300 animate-pulse-once">
      <AlertTriangle className="w-3 h-3 shrink-0 text-red-400" />
      <span className="flex-1 truncate">{message}</span>
      <button
        onClick={onConfirm}
        className="bg-red-500 hover:bg-red-600 text-white px-2 py-0.5 rounded text-xs font-semibold transition"
      >
        Yes
      </button>
      <button
        onClick={onCancel}
        className="bg-[#1e293b] hover:bg-[#334155] text-gray-300 px-2 py-0.5 rounded text-xs transition"
      >
        No
      </button>
    </div>
  );
}

/* ─── User Profile Menu ─────────────────────────────────── */
function UserMenu({ token, onLogout, onHome }) {
  const [open, setOpen] = useState(false);

  // Decode username from JWT payload (no verification needed — display only)
  let username = "User";
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    username = payload.username || payload.name || "User";
  } catch { }

  const initial = username.charAt(0).toUpperCase();

  return (
    <div className="relative border-t border-[#1e293b] p-4">
      {/* Dropdown — appears above the button */}
      {open && (
        <div className="absolute bottom-full left-4 right-4 mb-2 bg-[#1e293b] border border-[#334155] rounded-xl overflow-hidden shadow-2xl z-50">
          <button
            onClick={() => { onLogout(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition"
          >
            <span>→</span> Sign Out
          </button>
        </div>
      )}

      {/* Profile row */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition cursor-pointer group ${open ? "bg-[#1e293b]" : "hover:bg-[#1e293b]/60"}`}
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-md">
          {initial}
        </div>
        {/* Name */}
        <div className="flex-1 text-left">
          <div className="text-sm font-medium text-white leading-tight">{username}</div>
        </div>
        {/* Chevron */}
        <span className={`text-gray-500 transition-transform text-xs ${open ? "rotate-180" : ""}`}>▲</span>
      </button>
    </div>
  );
}

/* ─── Main Sidebar ──────────────────────────────────────── */
export default function Sidebar({
  projectId, setProjectId,
  sessionId, setSessionId,
  setDatasetId,
  viewingDatasetId, setViewingDatasetId,
  handleLogout, token,
  onDatasetDeleted, sessionRefreshKey,
  isSidebarOpen, setIsSidebarOpen
}) {
  const [projects, setProjects] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [confirmingSession, setConfirmingSession] = useState(null); // session id pending confirm
  const [confirmingDataset, setConfirmingDataset] = useState(null); // dataset id pending confirm
  const navigate = useNavigate();

  // ── Toast helpers – now uses global react-hot-toast ────────
  const addToast = useCallback((message, type = 'success') => {
    if (type === 'success') toast.success(message);
    else if (type === 'error') toast.error(message);
    else toast(message);
  }, []);

  // ── Data fetching ─────────────────────────────────────────
  useEffect(() => { fetchProjects(); }, [token]);
  useEffect(() => {
    if (sessionRefreshKey > 0 && projectId) fetchSessions(projectId);
  }, [sessionRefreshKey]);
  useEffect(() => {
    if (projectId) { fetchSessions(projectId); fetchProjectDatasets(projectId); }
    else { setSessions([]); setDatasets([]); }
  }, [projectId]);

  async function fetchProjects() {
    try {
      const res = await getProjects(token);
      setProjects(res.data);
      if (res.data.length > 0 && !projectId) setProjectId(res.data[0].id);
    } catch { addToast("Failed to load projects", "error"); }
  }

  async function fetchSessions(pid) {
    try {
      const res = await getSessions(pid, token);
      setSessions(res.data);
    } catch { addToast("Failed to load sessions", "error"); }
  }

  async function fetchProjectDatasets(pid) {
    try {
      const res = await getDatasets(pid);
      setDatasets(res.data.filter(d => d.project_id && !d.chat_id));
    } catch { addToast("Failed to load datasets", "error"); }
  }

  // ── Create ────────────────────────────────────────────────
  async function handleCreateProject() {
    if (!newProjectName.trim()) return;
    try {
      const res = await createProject(newProjectName, token);
      setProjects([res.data, ...projects]);
      setProjectId(res.data.id);
      setViewingDatasetId(null); // Return to chat view for new project
      setNewProjectName("");
      setIsCreatingProject(false);
      addToast(`Project "${res.data.name}" created!`);
    } catch { addToast("Failed to create project", "error"); }
  }

  async function handleCreateSession() {
    if (!projectId) return;
    try {
      const res = await createSession(projectId, token);
      setSessions([res.data, ...sessions]);
      setSessionId(res.data._id);
      setViewingDatasetId(null); // Return to chat view
    } catch { addToast("Failed to create chat", "error"); }
  }

  // ── Delete session ────────────────────────────────────────
  async function confirmDeleteSession(sid) {
    try {
      await deleteSession(sid, token);
      setSessions(sessions.filter(s => s._id !== sid));
      if (sessionId === sid) setSessionId(null);
      addToast("Chat deleted successfully");
    } catch { addToast("Failed to delete chat", "error"); }
    finally { setConfirmingSession(null); }
  }

  // ── Delete dataset ────────────────────────────────────────
  async function confirmDeleteDataset(did) {
    try {
      await deleteDataset(did, token);
      setDatasets(datasets.filter(d => d.id !== did));
      if (onDatasetDeleted) onDatasetDeleted();
      addToast("Dataset deleted successfully");
    } catch { addToast("Failed to delete dataset", "error"); }
    finally { setConfirmingDataset(null); }
  }

  return (
    <>

      {/* Mobile Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-80 bg-[#0f172a] border-r border-[#1e293b] flex flex-col text-white h-full flex-shrink-0
        transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>

        {/* Header */}
        <div className="p-6 pb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            DataIntel
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/")}
              title="Back to Home"
              className="text-gray-500 hover:text-indigo-400 transition text-xs flex items-center gap-1"
            >
              🏠
            </button>
            {/* Mobile Close Button */}
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden text-gray-500 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 space-y-8">

          {/* Project Selector */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">
              Active Project
            </label>
            {!isCreatingProject ? (
              <div className="space-y-2">
                <select
                  value={projectId || ""}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setDatasetId(null); // Clear targeting when switching projects
                    setViewingDatasetId(null); // Return to chat view
                  }}
                  className="w-full bg-[#1e293b] border border-[#334155] rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                >
                  <option value="">-- Choose Project --</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => setIsCreatingProject(true)}
                  className="w-full text-left text-sm text-indigo-400 hover:text-indigo-300 py-1 flex items-center gap-1"
                >
                  <PlusCircle className="w-4 h-4" /> New Project
                </button>
              </div>
            ) : (
              <div className="space-y-2 bg-[#1e293b] p-3 rounded-xl border border-indigo-500/30">
                <input
                  autoFocus
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
                  placeholder="Project Name..."
                  className="w-full bg-transparent text-sm text-white focus:outline-none placeholder-gray-500 mb-2 border-b border-[#334155] pb-1"
                />
                <div className="flex gap-2">
                  <button onClick={handleCreateProject} className="text-xs bg-indigo-500 hover:bg-indigo-600 px-3 py-1 rounded text-white flex-1">Create</button>
                  <button onClick={() => setIsCreatingProject(false)} className="text-xs bg-[#334155] hover:bg-[#475569] px-3 py-1 rounded text-white">Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Project Datasets */}
          {projectId && (
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">
                Project Datasets
              </label>

              {datasets.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {datasets.map(d => (
                    <div key={d.id}>
                      {confirmingDataset === d.id ? (
                        <InlineConfirm
                          message="Delete this dataset?"
                          onConfirm={() => confirmDeleteDataset(d.id)}
                          onCancel={() => setConfirmingDataset(null)}
                        />
                      ) : (
                        <div className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1e293b]/60 border border-[#334155]/50 text-sm text-gray-300">
                          <Database className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                          <span className="flex-1 truncate text-xs">{d.name}</span>
                          <button
                            onClick={() => setViewingDatasetId(viewingDatasetId === d.id ? null : d.id)}
                            className="opacity-0 group-hover:opacity-100 transition text-indigo-400 hover:text-indigo-300 shrink-0 mx-1"
                            title={viewingDatasetId === d.id ? "Close report" : "View Visual Analytics"}
                          >
                            {viewingDatasetId === d.id ? (
                              <Eye className="w-4 h-4" />
                            ) : (
                              <EyeOff className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setViewingDatasetId(d.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition text-emerald-400 hover:text-emerald-300 shrink-0 mx-1"
                            title="Database Quality & Health Audit"
                          >
                            <ShieldCheck className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setConfirmingDataset(d.id)}
                            className="opacity-0 group-hover:opacity-100 transition text-red-400 hover:text-red-300 shrink-0"
                            title="Delete dataset"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <UploadDataset
                token={token}
                projectId={projectId}
                onUploadComplete={() => {
                  fetchProjectDatasets(projectId);
                  if (onDatasetDeleted) onDatasetDeleted();
                  addToast("Dataset uploaded successfully!");
                }}
              />
            </div>
          )}

          {/* Sessions List */}
          {projectId && (
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center justify-between">
                Chat Sessions
                <span className="bg-[#1e293b] text-indigo-400 text-xs font-bold px-2 py-0.5 rounded-full border border-[#334155]">
                  {sessions.length}
                </span>
              </label>

              <button
                onClick={handleCreateSession}
                className="w-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 py-2.5 rounded-xl transition text-sm font-semibold flex items-center justify-center gap-2 mb-4"
              >
                <PlusCircle className="w-4 h-4" /> New Chat
              </button>

              <div className="space-y-1.5">
                {sessions.map(s => (
                  <div key={s._id}>
                    {confirmingSession === s._id ? (
                      <InlineConfirm
                        message="Delete this chat?"
                        onConfirm={() => confirmDeleteSession(s._id)}
                        onCancel={() => setConfirmingSession(null)}
                      />
                    ) : (
                      <div
                        onClick={() => {
                          setSessionId(s._id);
                          setViewingDatasetId(null); // Return to chat view
                        }}
                        className={`group px-3 py-2.5 rounded-lg text-sm cursor-pointer transition flex items-center gap-3
                          ${sessionId === s._id
                            ? 'bg-[#1e293b] text-white border border-[#334155]'
                            : 'text-gray-400 hover:bg-[#1e293b]/50 hover:text-gray-200'}`}
                      >
                        <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
                        <span className="flex-1 truncate">{s.title}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmingSession(s._id); }}
                          className="opacity-0 group-hover:opacity-100 transition text-red-400 hover:text-red-300 shrink-0"
                          title="Delete chat"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {sessions.length === 0 && (
                  <div className="text-xs text-gray-500 text-center py-4 border border-dashed border-[#334155] rounded-xl">
                    No chats yet. Create one above!
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* User Profile Footer */}
        <UserMenu token={token} onLogout={handleLogout} onHome={() => navigate("/")} />

      </div>
    </>
  );
}