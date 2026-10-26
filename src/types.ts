export type Settings = { paused: boolean; max_entries: number; max_total_bytes: number; max_item_bytes: number };
export type Device = { id: string; name: string; free_commands: boolean; created_at: number };
export type Capabilities = {
  desktop: { clipboard_watch: boolean; clipboard_write: boolean; window_list: boolean; window_activate: boolean; window_close?: boolean; reason: string; clipboard_notice: string };
  interactive_commands?: boolean; monitor?: boolean; input?: boolean; applications?: boolean; media: boolean; commands: boolean; free_commands: boolean; discovery: boolean;
};
export type ServerInfo = { server_id: string; device: Device; capabilities: Capabilities; settings: Settings };
export type Credentials = { host: string; port: number; fingerprint: string; token: string; server_id: string; device: Device };
export type Clip = { id: string; mime: string; preview: string; bytes: number; created_at: number; promoted_at: number; content?: string };
export type WindowInfo = { id: string; app_id: string; app_name: string; title: string; active: boolean; icon: string | null };
export type Player = {
  id: string; name: string; title: string; artists: string[]; album: string; status: string;
  length_us: number; position_us: number; track_id: string; volume: number | null; can_play: boolean; can_pause: boolean;
  can_next: boolean; can_previous: boolean; can_seek: boolean; can_control: boolean; artwork_available: boolean;
};
export type SavedCommand = { id: string; name: string; command: string; shell: string; cwd: string; timeout_seconds: number };
export type Spec = { command: string; shell: string; cwd: string; timeout_seconds: number; saved_id?: string | null; keep_history?: boolean };
export type Job = { id: string; owner: string; spec: Spec; status: string; created_at: number; finished_at: number | null; exit_code: number | null; stdout: string; stderr: string; output_truncated: boolean };
export type ConnectionState = 'offline' | 'connecting' | 'pairing' | 'connected' | 'retrying' | 'error';
export type ProtocolEvent = { v: 1; event: string; seq: number; data: unknown };
