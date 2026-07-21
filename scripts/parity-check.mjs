// Two-session cross-client parity check (US-07, automated proxy).
//
// Spins up TWO independent authenticated owner sessions (separate clients =
// separate token storage, exactly like a web build and a native build both
// signed in as the owner) and proves the store is a single synced backbone:
// a write through client A is visible to client B, and a write through B is
// visible to A. Mirrors the repo's query shape (owner_id + deleted_at IS NULL +
// local-day range). Exits non-zero on any failed assertion.
//
// This is the executable core of US-07. It does NOT exercise the RN app's
// fetch-on-focus UI or a physical device (no feature UI ships in F-01) — that
// remains a manual real-device pass once a logging screen exists.
//
// Run: `npm run parity`.
import { createClient } from '@supabase/supabase-js';

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.OWNER_EMAIL;
const password = process.env.OWNER_PASSWORD;

function dayRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function listDay(client, date) {
  const { start, end } = dayRange(date);
  const { data, error } = await client
    .from('meal_entries')
    .select('*')
    .gte('logged_at', start)
    .lt('logged_at', end)
    .is('deleted_at', null)
    .order('logged_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function newClient(label) {
  // persistSession:false → each client is an isolated session, like two devices.
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  assert(!error, `${label} sign-in failed: ${error?.message}`);
  return { client, uid: data.user?.id };
}

async function main() {
  assert(url && anonKey, 'EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY must be set (.env)');
  assert(
    email && password && password !== '<fill-in-owner-password>',
    'OWNER_EMAIL / OWNER_PASSWORD must be set in .env.local',
  );

  const A = await newClient('client A');
  const B = await newClient('client B');
  assert(A.uid === B.uid, 'both clients must be the same owner identity');
  console.log(`✓ two independent sessions signed in as owner ${A.uid}`);

  const today = new Date();
  let id;
  try {
    // --- A writes -> B must see it ---
    const t0 = Date.now();
    const created = await A.client
      .from('meal_entries')
      .insert({
        owner_id: A.uid,
        logged_at: today.toISOString(),
        section: 'lunch',
        source: 'manual',
        name: 'parity-test meal',
        calories: 400,
      })
      .select()
      .single();
    assert(!created.error, `A insert failed: ${created.error?.message}`);
    id = created.data.id;
    console.log(`✓ client A created ${id}`);

    const bList = await listDay(B.client, today);
    const bSaw = bList.find((e) => e.id === id);
    assert(bSaw, 'client B did not see the entry client A created (parity A→B FAILED)');
    console.log(`✓ client B sees A's write (parity A→B); fetch latency ~${Date.now() - t0}ms`);

    // --- B writes -> A must see it ---
    const t1 = Date.now();
    const updated = await B.client
      .from('meal_entries')
      .update({ calories: 720 })
      .eq('id', id)
      .is('deleted_at', null)
      .select()
      .single();
    assert(!updated.error, `B update failed: ${updated.error?.message}`);
    assert(updated.data.calories === 720, 'B update did not persist');

    const aList = await listDay(A.client, today);
    const aSaw = aList.find((e) => e.id === id);
    assert(aSaw, 'client A did not see the entry after B updated it');
    assert(aSaw.calories === 720, "client A did not see B's edit (parity B→A FAILED)");
    assert(
      new Date(aSaw.updated_at).getTime() > new Date(created.data.updated_at).getTime(),
      'updated_at did not advance across the cross-client edit',
    );
    console.log(`✓ client A sees B's edit (parity B→A); fetch latency ~${Date.now() - t1}ms`);

    // --- delete on one -> gone on the other ---
    await A.client
      .from('meal_entries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null);
    const bAfterDelete = await listDay(B.client, today);
    assert(
      !bAfterDelete.some((e) => e.id === id),
      "client B still sees the row after A soft-deleted it (delete didn't propagate)",
    );
    console.log("✓ client B no longer sees the row after A's soft-delete (delete propagates)");

    console.log('\nPARITY PASSED ✅  — write on one client is visible on the other, both directions');
  } finally {
    if (id) {
      await A.client.from('meal_entries').delete().eq('id', id);
      console.log(`(cleanup) hard-deleted test row ${id}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nPARITY FAILED ❌\n${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
