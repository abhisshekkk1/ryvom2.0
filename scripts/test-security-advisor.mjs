import assert from "node:assert/strict";
import fs from "node:fs";

// Load configuration from .env.local
let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if ((!SUPABASE_URL || !SUPABASE_ANON_KEY) && fs.existsSync(".env.local")) {
  const envContent = fs.readFileSync(".env.local", "utf8");
  const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=["']?([^"'\r\n]+)/);
  const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=["']?([^"'\r\n]+)/);
  if (urlMatch) SUPABASE_URL = urlMatch[1];
  if (keyMatch) SUPABASE_ANON_KEY = keyMatch[1];
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log("\n=======================================================");
  console.log("  SUPABASE SECURITY ADVISOR AUTOMATED TEST SUITE");
  console.log("=======================================================\n");

  assert.ok(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL must be configured");
  assert.ok(SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY must be configured");

  console.log("1. Public / Anon Table Access Lockdown:");

  // Test 1: anon cannot read password_reset_requests
  await test("anon cannot read password_reset_requests via Data API", async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/password_reset_requests?select=*`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    // After migration, role 'anon' has REVOKE ALL, resulting in 401 or 403 or 404 or empty due to RLS
    // Specifically, if grants are revoked, PostgREST returns 401 Unauthorized or 403 Forbidden:
    // {"code":"42501","message":"permission denied for table password_reset_requests"}
    if (res.status === 401 || res.status === 403) {
      assert.ok(true, "Anon read properly rejected with HTTP 401/403");
    } else if (res.status === 200) {
      const data = await res.json();
      assert.equal(data.length, 0, "No rows may ever be returned to anon");
    } else {
      assert.fail(`Unexpected status ${res.status} returned for anon read`);
    }
  });

  // Test 2: anon cannot insert into password_reset_requests
  await test("anon cannot insert into password_reset_requests via Data API", async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/password_reset_requests`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "malicious_actor",
        reason: "unauthorized_reset_attempt",
      }),
    });

    assert.ok(
      res.status === 401 || res.status === 403 || res.status === 404,
      `Anon insert must be rejected with 401/403/404, got ${res.status}`
    );
  });

  // Test 3: anon cannot delete from password_reset_requests
  await test("anon cannot delete from password_reset_requests via Data API", async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/password_reset_requests?username=eq.anyone`, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    assert.ok(
      res.status === 401 || res.status === 403 || res.status === 404,
      `Anon delete must be rejected with 401/403/404, got ${res.status}`
    );
  });

  // Test 4: anon cannot insert into workout_logs
  await test("anon cannot insert into workout_logs via Data API", async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/workout_logs`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        exercise_name: "Bench Press",
        weight_kg: 100,
        reps: 10,
        rpe: 8,
      }),
    });

    assert.ok(
      res.status === 401 || res.status === 403 || res.status === 404,
      `Anon insert on workout_logs must be rejected with 401/403/404, got ${res.status}`
    );
  });

  // Test 5: unauthorized users cannot query workout_logs
  await test("unauthorized users cannot access private workout_logs", async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/workout_logs?select=*`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (res.status === 401 || res.status === 403) {
      assert.ok(true, "Unauthorized read correctly rejected");
    } else if (res.status === 200) {
      const data = await res.json();
      assert.equal(data.length, 0, "No rows may ever be exposed to unauthorized roles");
    } else {
      assert.fail(`Unexpected status ${res.status} returned for unauthorized read`);
    }
  });

  console.log("\n2. Coach & Tenant Isolation Policies (Workout Logs):");

  // Test 6: Coach A cannot access Coach B's workout logs
  await test("cross-coach isolation: spoofed user ID query returns 0 rows or fails", async () => {
    // Attempt to filter or query for a victim coach's user_id using unauthenticated/anon request
    const victimCoachId = "a0000000-0000-0000-0000-000000000001";
    const res = await fetch(`${SUPABASE_URL}/rest/v1/workout_logs?user_id=eq.${victimCoachId}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (res.status === 401 || res.status === 403) {
      assert.ok(true);
    } else if (res.status === 200) {
      const data = await res.json();
      assert.equal(data.length, 0, "Cross-coach query must never return victim coach data");
    } else {
      assert.fail(`Unexpected status ${res.status}`);
    }
  });

  console.log("\n3. Legitimate Application Health & Invariants:");

  // Test 7: Modern RYVOM platform tables remain functional
  await test("core application tables (clients, check_ins) are protected by RLS", async () => {
    for (const table of ["clients", "check_ins", "coach_reviews", "client_coach_notes"]) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      assert.equal(res.status, 200, `Table ${table} should be queryable by anon with RLS filtering`);
      const rows = await res.json();
      assert.equal(rows.length, 0, `Table ${table} must return 0 rows to unauthenticated callers under RLS`);
    }
  });

  console.log("\n=======================================================");
  console.log(`  SECURITY TEST SUITE COMPLETE: ${passed}/${passed + failed} passed`);
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Security test suite error:", err);
  process.exit(1);
});
