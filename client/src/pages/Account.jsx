import { useState } from "react";
import { KeyRound, UserCircle } from "lucide-react";
import { useAuth } from "../auth.jsx";
import { api } from "../api.js";
import { Badge, Button, Card, FormError, PageBody, PageHeader, SpecRow, TextInput, initials, toast } from "../components/ui.jsx";

export default function Account() {
  const { user, policy } = useAuth();
  const [f, setF] = useState({ cur: "", a: "", b: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!f.cur) return setErr("Enter your current password.");
    if (f.a.length < policy.passwordMinLength) return setErr(`Use at least ${policy.passwordMinLength} characters for the new password.`);
    if (f.a === f.cur) return setErr("Choose a password different from the current one.");
    if (f.a !== f.b) return setErr("The two new passwords do not match.");
    setBusy(true);
    try {
      await api("/auth/change-password", { method: "POST", body: { current: f.cur, next: f.a } });
      setErr("");
      setF({ cur: "", a: "", b: "" });
      toast.success("Password updated. Use the new password next time you sign in.");
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <PageHeader icon={UserCircle} title="My account" subtitle="Your profile and password" />
      <PageBody>
        <div className="grid gap-5 lg:grid-cols-2 max-w-5xl">
          <Card title="Profile" icon={UserCircle}>
            <div className="flex items-center gap-4 mb-4">
              <span className="w-16 h-16 bg-blue-800 rounded-full flex items-center justify-center text-xl font-semibold text-white">{initials(user.name)}</span>
              <div>
                <p className="text-base font-semibold text-slate-900">{user.name}</p>
                <p className="text-sm text-slate-500">{user.email}</p>
                <div className="mt-1">
                  <Badge variant={user.role === "Admin" ? "violet" : "info"}>{user.role}</Badge>
                </div>
              </div>
            </div>
            <SpecRow a="Region" b={user.region || "–"} />
            <SpecRow a="Team" b={user.team || "–"} />
            <p className="mt-3 text-xs text-slate-500">To change these details, contact your admin.</p>
          </Card>
          <Card title="Change password" icon={KeyRound}>
            <form onSubmit={submit} className="space-y-4">
              <FormError message={err} />
              <TextInput label="Current password" type="password" autoComplete="current-password" value={f.cur} onChange={set("cur")} />
              <TextInput label="New password" type="password" autoComplete="new-password" value={f.a} onChange={set("a")} hint={`At least ${policy.passwordMinLength} characters`} />
              <TextInput label="Confirm new password" type="password" autoComplete="new-password" value={f.b} onChange={set("b")} />
              <Button type="submit" loading={busy}>
                Update password
              </Button>
            </form>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
