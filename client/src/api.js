export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || "Something went wrong. Please try again.");
    this.status = status;
    this.code = data?.code;
    this.ref = data?.ref;
  }
}

let onExpired = null;
/** Called when the server says the session timed out. */
export const setOnExpired = (fn) => {
  onExpired = fn;
};

export async function api(path, { method = "GET", body, form } = {}) {
  const opts = { method, credentials: "include", headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch("/api" + path, opts);
  } catch {
    throw new ApiError(0, { error: "Could not reach the server. Check your connection and try again." });
  }
  const data = (res.headers.get("content-type") || "").includes("json") ? await res.json() : null;
  if (!res.ok) {
    // Timed out, or ended elsewhere (password changed, deactivated, signed out by an admin).
    if (res.status === 401 && ["SESSION_EXPIRED", "SESSION_ENDED"].includes(data?.code) && onExpired) onExpired(data.error);
    throw new ApiError(res.status, data);
  }
  return data;
}

export const fileUrl = (versionId, inline = false) => `/api/files/versions/${versionId}/download${inline ? "?inline=1" : ""}`;

export const openFile = (versionId) => window.open(fileUrl(versionId), "_blank", "noopener");

export const FILE_TYPES = {
  brochure: "Brochure",
  kld: "Key Line Drawing (KLD)",
  sheet: "Sales Spreadsheet",
  images: "Images",
  videos: "Videos",
  media: "Media files",
};

/** Where a search matched, minus the obvious name/category. */
export const extraWhere = (w) => w.filter((k) => k !== "name" && k !== "category");

export const ext =(n) => (/\.\w+$/.test(n) ? n.split(".").pop().toUpperCase() : "FILE");

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "–";

export const fmtStamp = (d) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";
