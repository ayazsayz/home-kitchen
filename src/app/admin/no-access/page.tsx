"use client";
import { supabaseBrowser } from "@/lib/supabase";

export default function NoAccess() {
  return (
    <div className="mx-auto mt-24 max-w-sm space-y-4 px-4 text-center">
      <div className="text-4xl">🔒</div>
      <h1 className="text-2xl font-bold">No access</h1>
      <p className="text-muted">This login isn&apos;t set up as staff, or it has been switched off. Ask the owner to add you on the Staff page.</p>
      <button
        className="btn w-full"
        onClick={async () => {
          await supabaseBrowser().auth.signOut();
          window.location.href = "/admin/login";
        }}
      >
        Sign out
      </button>
    </div>
  );
}
