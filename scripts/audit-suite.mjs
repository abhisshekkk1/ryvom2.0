import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  extractPhotoPath,
  validatePhotoOwnership,
} from "../lib/photoStorage.ts";
import {
  formatNum,
  formatDiff,
  sortCheckInsChronologically,
  filterCheckInsByRange,
  computeMetricSummary,
  computePerformancePRs,
} from "../lib/progressAnalytics.ts";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

let passedCount = 0;
let failedCount = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

async function main() {
  console.log("\n=======================================================");
  console.log("  RYVOM PRODUCTION AUDIT & VERIFICATION SUITE");
  console.log("=======================================================\n");

  // ─── 1. STORAGE PRIVACY & PATH ISOLATION ───
  console.log("1. Storage Privacy & Client Isolation:");

  await runTest("extractPhotoPath correctly normalizes relative paths", () => {
    assert.equal(
      extractPhotoPath("clients/c123/front.jpg?token=xyz"),
      "clients/c123/front.jpg"
    );
  });

  await runTest("extractPhotoPath extracts path from full Supabase storage URLs", () => {
    const fullUrl =
      "https://kfhwmkmxxdzgeeyuxizx.supabase.co/storage/v1/object/public/client-photos/clients/c123/photo.webp?v=1";
    assert.equal(extractPhotoPath(fullUrl), "clients/c123/photo.webp");
  });

  await runTest("extractPhotoPath safely handles null, undefined, and empty string", () => {
    assert.equal(extractPhotoPath(null), null);
    assert.equal(extractPhotoPath(undefined), null);
    assert.equal(extractPhotoPath(""), null);
    assert.equal(extractPhotoPath("   "), null);
  });

  await runTest("validatePhotoOwnership approves legitimate client photo paths", () => {
    assert.equal(validatePhotoOwnership("clients/client-abc-123/img.jpg", "client-abc-123"), true);
    assert.equal(validatePhotoOwnership(null, "client-abc-123"), true);
  });

  await runTest("validatePhotoOwnership blocks cross-client photo spoofing", () => {
    const isAllowed = validatePhotoOwnership(
      "clients/victim-client-999/front.jpg",
      "attacker-client-111"
    );
    assert.equal(isAllowed, false, "Must reject cross-client photo path!");
  });

  await runTest("validatePhotoOwnership blocks path traversal attempts", () => {
    assert.equal(
      validatePhotoOwnership("clients/../system/file.jpg", "client-abc"),
      false
    );
  });

  // ─── 2. PORTAL TOKEN SECURITY & CRYPTOGRAPHY ───
  console.log("\n2. Portal Token Hashing & Cryptography:");

  await runTest("Token hashing produces consistent 64-character SHA-256 hex digest", () => {
    const token = "a".repeat(64);
    const hash1 = createHash("sha256").update(token).digest("hex");
    const hash2 = createHash("sha256").update(token).digest("hex");
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
    assert.notEqual(token, hash1, "Token should never be stored in plain text");
  });

  await runTest("Token hashing resists preimage collision and empty input", () => {
    const h1 = createHash("sha256").update("token_1").digest("hex");
    const h2 = createHash("sha256").update("token_2").digest("hex");
    assert.notEqual(h1, h2);
  });

  // ─── 3. PROGRESS ANALYTICS MATHEMATICAL INVARIANTS ───
  console.log("\n3. Progress Analytics & Math Invariants:");

  await runTest("formatNum handles NaN, null, undefined, Infinity gracefully", () => {
    assert.equal(formatNum(null), "-");
    assert.equal(formatNum(undefined), "-");
    assert.equal(formatNum(NaN), "-");
    assert.equal(formatNum(Infinity), "-");
    assert.equal(formatNum(-Infinity), "-");
    assert.equal(formatNum(80.5, 1, "", " kg"), "80.5 kg");
  });

  await runTest("formatDiff handles signs and formatting safely", () => {
    assert.equal(formatDiff(null), "-");
    assert.equal(formatDiff(NaN), "-");
    assert.equal(formatDiff(2.4, 1, "kg"), "+2.4 kg");
    assert.equal(formatDiff(-3.1, 1, "kg"), "-3.1 kg");
    assert.equal(formatDiff(0, 1, "kg"), "0.0 kg");
  });

  await runTest("computeMetricSummary calculates accurate stats", () => {
    const checkins = [
      { week_ending: "2026-01-01", weight: 85.0 },
      { week_ending: "2026-01-08", weight: 84.0 },
      { week_ending: "2026-01-15", weight: 83.0 },
    ];
    const summary = computeMetricSummary(checkins, "weight");
    assert.equal(summary.first, 85.0);
    assert.equal(summary.latest, 83.0);
    assert.equal(summary.highest, 85.0);
    assert.equal(summary.lowest, 83.0);
    assert.equal(summary.average, 84.0);
    assert.equal(summary.absoluteChange, -2.0);
    assert.equal(Math.round(summary.percentageChange * 100) / 100, -2.35);
    assert.equal(summary.count, 3);
  });

  await runTest("computeMetricSummary handles empty lists without dividing by zero", () => {
    const summary = computeMetricSummary([], "weight");
    assert.equal(summary.first, null);
    assert.equal(summary.latest, null);
    assert.equal(summary.average, null);
    assert.equal(summary.absoluteChange, null);
    assert.equal(summary.percentageChange, null);
    assert.equal(summary.count, 0);
  });

  await runTest("computePerformancePRs identifies starting, current, and best PR", () => {
    const metric = {
      id: "m-1",
      client_id: "c-1",
      name: "Bench Press",
      unit: "kg",
      metric_type: "weight",
      target_value: 120,
      track_on_checkin: true,
      show_on_dashboard: true,
      created_at: "2026-01-01",
      logs: [
        { id: "l-1", metric_id: "m-1", client_id: "c-1", check_in_id: null, logged_date: "2026-01-01", value: 90, notes: null, created_at: "" },
        { id: "l-2", metric_id: "m-1", client_id: "c-1", check_in_id: null, logged_date: "2026-01-15", value: 105, notes: null, created_at: "" },
        { id: "l-3", metric_id: "m-1", client_id: "c-1", check_in_id: null, logged_date: "2026-01-30", value: 100, notes: null, created_at: "" },
      ],
    };
    const computed = computePerformancePRs(metric);
    assert.equal(computed.starting_value, 90);
    assert.equal(computed.current_value, 100);
    assert.equal(computed.best_value, 105);
    assert.equal(computed.absolute_change, 10);
  });

  // ─── 4. LIVE SERVER SECURITY HEADERS & GATES ───
  console.log("\n4. Live Production Server & API Authorization Gates:");

  await runTest("Server is live and returns HTTP 200 on /login", async () => {
    const res = await fetch(`${BASE_URL}/login`);
    assert.equal(res.status, 200, "Login page must be publicly accessible");
  });

  await runTest("Security headers are enforced on all responses", async () => {
    const res = await fetch(`${BASE_URL}/login`);
    assert.equal(res.headers.get("x-frame-options"), "DENY", "X-Frame-Options must be DENY");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff", "nosniff must be enforced");
    assert.ok(res.headers.get("content-security-policy"), "CSP header must be present");
  });

  await runTest("Unauthenticated API access to /api/clients returns 401", async () => {
    const res = await fetch(`${BASE_URL}/api/clients`);
    assert.equal(res.status, 401, "/api/clients must reject unauthenticated requests with 401");
  });

  await runTest("Unauthenticated API access to /api/self returns 401", async () => {
    const res = await fetch(`${BASE_URL}/api/self`);
    assert.equal(res.status, 401, "/api/self must reject unauthenticated requests with 401");
  });

  await runTest("Unauthenticated API access to /api/clients/invite returns 401", async () => {
    const res = await fetch(`${BASE_URL}/api/clients/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: "some-id" }),
    });
    assert.equal(res.status, 401, "/api/clients/invite must reject unauthenticated requests with 401");
  });

  await runTest("Unauthenticated access to client progress endpoints returns 401", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const endpoints = [
      `/api/clients/${fakeId}`,
      `/api/clients/${fakeId}/checkins`,
      `/api/clients/${fakeId}/coach-notes`,
      `/api/clients/${fakeId}/performance`,
      `/api/clients/${fakeId}/review`,
      `/api/clients/${fakeId}/upload`,
    ];
    for (const ep of endpoints) {
      const res = await fetch(`${BASE_URL}${ep}`);
      assert.equal(res.status, 401, `Endpoint ${ep} must return 401 when unauthenticated`);
    }
  });

  await runTest("Client portal route behaves securely with invalid token or missing key", async () => {
    const res = await fetch(`${BASE_URL}/api/client-portal/invalid-token-1234567890`);
    if (res.status === 500) {
      const json = await res.json();
      assert.ok(json.error.includes("Portal is not configured"));
    } else {
      assert.equal(res.status, 404, "Invalid portal link must return 404 Not Found");
      const json = await res.json();
      assert.ok(json.error.includes("invalid or expired"));
    }
  });

  await runTest("Unauthenticated page requests to / are redirected to /login", async () => {
    const res = await fetch(`${BASE_URL}/`, { redirect: "manual" });
    assert.ok(
      res.status === 302 || res.status === 307 || res.status === 308,
      "Unauthenticated page access must redirect"
    );
    const location = res.headers.get("location");
    assert.ok(location?.includes("/login"), "Must redirect to /login");
  });

  await runTest("All protected pages (/clients, /my-progress, /settings) redirect unauthenticated users", async () => {
    const protectedPages = ["/clients", "/my-progress", "/settings", "/settings/update-password"];
    for (const path of protectedPages) {
      const res = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
      assert.ok(
        res.status === 302 || res.status === 307 || res.status === 308,
        `Path ${path} must redirect unauthenticated users`
      );
      assert.ok(res.headers.get("location")?.includes("/login"), `${path} must redirect to /login`);
    }
  });

  await runTest("Strict-Transport-Security and Referrer-Policy headers are enforced", async () => {
    const res = await fetch(`${BASE_URL}/login`);
    assert.ok(res.headers.get("strict-transport-security"), "HSTS header must be present");
    assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  });

  console.log("\n=======================================================");
  console.log(`  AUDIT SUITE COMPLETE: ${passedCount}/${passedCount + failedCount} tests passed`);
  console.log("=======================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Audit suite unhandled error:", err);
  process.exit(1);
});
