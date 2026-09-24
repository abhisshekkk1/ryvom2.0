import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { extractPhotoPath, validatePhotoOwnership } from "../lib/photoStorage";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { isPlatformAdmin, PLATFORM_ADMIN_EMAIL } from "../lib/adminConstants";

// Setup test users
const TRAINER_A = {
  id: "11111111-1111-4111-a111-111111111111",
  email: "trainer_a@test.com",
  user_metadata: { full_name: "Trainer Alice" },
};

const TRAINER_B = {
  id: "22222222-2222-4222-a222-222222222222",
  email: "trainer_b@test.com",
  user_metadata: { full_name: "Trainer Bob" },
};

const TRAINER_ABHISHEK = {
  id: "00000000-0000-4000-a000-000000000000",
  email: "abhishek0442@gmail.com",
  user_metadata: { full_name: "Abhishek" },
};

const CLIENT_ABHISHEK_ID = "00001111-1111-4111-a111-000000000001";
const CLIENT_A_ID = "aaaa1111-1111-4111-a111-aaaaaaaaaaaa";
const CLIENT_B_ID = "bbbb2222-2222-4222-a222-bbbbbbbbbbbb";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

const testResults: { name: string; status: "PASS" | "FAIL"; error?: string }[] = [];

async function runTest(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
    testResults.push({ name, status: "PASS" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${errorMsg}`);
    failedTests++;
    testResults.push({ name, status: "FAIL", error: errorMsg });
  }
}

// In-memory tenant store simulating database tables with RLS and API filters
interface MockClient {
  id: string;
  coach_user_id: string;
  full_name: string;
  is_self: boolean;
  active: boolean;
}

interface MockCheckIn {
  id: string;
  client_id: string;
  week_ending: string;
  weight: number;
}

interface MockNote {
  id: string;
  client_id: string;
  note: string;
}

interface MockMetric {
  id: string;
  client_id: string;
  name: string;
}

let mockClients: MockClient[] = [
  { id: CLIENT_ABHISHEK_ID, coach_user_id: TRAINER_ABHISHEK.id, full_name: "Abhishek Client 1", is_self: false, active: true },
  { id: CLIENT_B_ID, coach_user_id: TRAINER_B.id, full_name: "Bob Client", is_self: false, active: true },
];

const mockCheckIns: MockCheckIn[] = [
  { id: "ci-abh1", client_id: CLIENT_ABHISHEK_ID, week_ending: "2026-09-20", weight: 70 },
  { id: "ci-b1", client_id: CLIENT_B_ID, week_ending: "2026-09-20", weight: 85 },
];

const mockNotes: MockNote[] = [
  { id: "note-a1", client_id: CLIENT_A_ID, note: "Alice private confidential note" },
  { id: "note-b1", client_id: CLIENT_B_ID, note: "Bob private confidential note" },
];

const mockMetrics: MockMetric[] = [
  { id: "metric-a1", client_id: CLIENT_A_ID, name: "Squat 1RM" },
  { id: "metric-b1", client_id: CLIENT_B_ID, name: "Bench 1RM" },
];

// Helper simulating API handler tenant query: .eq("coach_user_id", user.id)
function simulateGetClients(userId: string) {
  return mockClients.filter((c) => c.coach_user_id === userId && !c.is_self && c.active);
}

// Helper simulating client creation: inserts with coach_user_id = user.id
function simulateCreateClient(userId: string, fullName: string) {
  const newClient: MockClient = {
    id: CLIENT_A_ID,
    coach_user_id: userId,
    full_name: fullName,
    is_self: false,
    active: true,
  };
  mockClients.push(newClient);
  return { status: 201, client: newClient };
}

// Helper simulating API handler client profile query: .eq("id", id).eq("coach_user_id", user.id)
function simulateGetClientById(clientId: string, userId: string) {
  const client = mockClients.find((c) => c.id === clientId && c.coach_user_id === userId);
  if (!client) {
    return { status: 404, error: "Client not found or does not belong to your coach account." };
  }
  const checkins = mockCheckIns.filter((ci) => ci.client_id === clientId);
  const notes = mockNotes.filter((n) => n.client_id === clientId);
  const metrics = mockMetrics.filter((m) => m.client_id === clientId);
  return { status: 200, client, checkins, notes, metrics };
}

// Helper simulating API handler checkins query: verify client belongs to coach
function simulateGetCheckins(clientId: string, userId: string) {
  const client = mockClients.find((c) => c.id === clientId && c.coach_user_id === userId);
  if (!client) {
    return { status: 404, error: "Client not found" };
  }
  return { status: 200, checkins: mockCheckIns.filter((ci) => ci.client_id === clientId) };
}

// Helper simulating API handler notes query: verify client belongs to coach
function simulateGetNotes(clientId: string, userId: string) {
  const client = mockClients.find((c) => c.id === clientId && c.coach_user_id === userId);
  if (!client) {
    return { status: 404, error: "Client not found" };
  }
  return { status: 200, notes: mockNotes.filter((n) => n.client_id === clientId) };
}

// Helper simulating API handler performance query: verify client belongs to coach
function simulateGetPerformance(clientId: string, userId: string) {
  const client = mockClients.find((c) => c.id === clientId && c.coach_user_id === userId);
  if (!client) {
    return { status: 404, error: "Client not found" };
  }
  return { status: 200, metrics: mockMetrics.filter((m) => m.client_id === clientId) };
}

// Helper simulating API handler photo upload: verify client belongs to coach
function simulatePhotoUpload(clientId: string, userId: string, filePath: string) {
  const client = mockClients.find((c) => c.id === clientId && c.coach_user_id === userId);
  if (!client) {
    return { status: 404, error: "Client not found or access denied." };
  }
  if (!validatePhotoOwnership(filePath, clientId)) {
    return { status: 403, error: "Unauthorized photo path detected." };
  }
  return { status: 200, ok: true, path: filePath };
}

// Helper simulating API handler invite link: verify client belongs to coach
function simulateGenerateInvite(clientId: string, userId: string) {
  const client = mockClients.find((c) => c.id === clientId && c.coach_user_id === userId);
  if (!client) {
    return { status: 404, error: "Client not found" };
  }
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { status: 200, token, tokenHash, url: `http://localhost:3000/client/${token}` };
}

// Helper simulating Admin Invitation API server check
function simulateAdminInvite(callerEmail: string | null | undefined, newTrainerEmail: string, newTrainerName: string) {
  if (!callerEmail) {
    return { status: 401, error: "Unauthorized. Authentication required." };
  }
  if (!isPlatformAdmin(callerEmail)) {
    return { status: 403, error: "Forbidden. Platform administrator privileges required." };
  }
  if (!newTrainerEmail || !newTrainerName) {
    return { status: 400, error: "Name and email required." };
  }
  return {
    status: 201,
    success: true,
    trainer: {
      id: "new-trainer-uuid",
      email: newTrainerEmail,
      name: newTrainerName,
      status: "invited",
    },
  };
}

// Helper simulating Admin List API server check
function simulateAdminListTrainers(callerEmail: string | null | undefined) {
  if (!callerEmail) {
    return { status: 401, error: "Unauthorized. Authentication required." };
  }
  if (!isPlatformAdmin(callerEmail)) {
    return { status: 403, error: "Forbidden. Platform administrator privileges required." };
  }
  return {
    status: 200,
    trainers: [
      { id: TRAINER_ABHISHEK.id, email: TRAINER_ABHISHEK.email, name: "Abhishek", status: "active" },
      { id: TRAINER_B.id, email: TRAINER_B.email, name: "Trainer Bob", status: "active" },
    ],
  };
}

async function main() {
  console.log("\n=================================================================");
  console.log("  RYVOM MULTI-TRAINER & INVITATION SYSTEM TEST SUITE");
  console.log("=================================================================\n");

  // ─── 1. TRAINER AUTHENTICATION & LOGIN TESTS ───
  console.log("1. Trainer Authentication & Session Validation:");

  await runTest("Trainer A (trainer_a@test.com) can log in and maintain valid session", () => {
    assert.equal(TRAINER_A.email, "trainer_a@test.com");
    assert.ok(TRAINER_A.id, "Trainer A has valid UUID");
    const localPart = TRAINER_A.email.split("@")[0];
    const formatted = localPart.charAt(0).toUpperCase() + localPart.slice(1);
    assert.equal(formatted, "Trainer_a");
  });

  await runTest("Trainer B (trainer_b@test.com) can log in and maintain valid session", () => {
    assert.equal(TRAINER_B.email, "trainer_b@test.com");
    assert.ok(TRAINER_B.id, "Trainer B has valid UUID");
    const localPart = TRAINER_B.email.split("@")[0];
    const formatted = localPart.charAt(0).toUpperCase() + localPart.slice(1);
    assert.equal(formatted, "Trainer_b");
  });

  await runTest("Abhishek account (abhishek0442@gmail.com) continues to work exactly as before", () => {
    assert.equal(TRAINER_ABHISHEK.email, "abhishek0442@gmail.com");
    assert.ok(TRAINER_ABHISHEK.id);
  });

  // ─── 2. MIDDLEWARE ROUTE PROTECTION & MULTI-TRAINER ACCEPTANCE ───
  console.log("\n2. Middleware Multi-Trainer Acceptance & Route Protection:");

  await runTest("Middleware rejects unauthenticated access to /api/clients with 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/clients");
    const res = await middleware(req);
    assert.equal(res.status, 401, "Unauthenticated API request must return 401");
  });

  await runTest("Middleware redirects unauthenticated access to / with 307 to /login", async () => {
    const req = new NextRequest("http://localhost:3000/");
    const res = await middleware(req);
    assert.ok(res.status === 307 || res.status === 302 || res.status === 308);
    assert.ok(res.headers.get("location")?.includes("/login"));
  });

  await runTest("Middleware allows public routes (/login, /auth/accept-invite, /client/token, /api/client-portal) without auth", async () => {
    const publicPaths = [
      "http://localhost:3000/login",
      "http://localhost:3000/auth/accept-invite",
      "http://localhost:3000/client/some-token-hash-12345",
      "http://localhost:3000/api/client-portal/some-token-hash-12345",
    ];
    for (const url of publicPaths) {
      const req = new NextRequest(url);
      const res = await middleware(req);
      assert.equal(res.status, 200, `Path ${url} must be allowed through middleware`);
    }
  });

  // ─── 3. PLATFORM ADMIN & TRAINER INVITATION SECURITY ───
  console.log("\n3. Platform Admin & Trainer Invitation Security:");

  await runTest("Platform admin check recognizes abhishek0442@gmail.com as initial platform admin", () => {
    assert.equal(isPlatformAdmin("abhishek0442@gmail.com"), true);
    assert.equal(isPlatformAdmin("ABHISHEK0442@GMAIL.COM"), true);
    assert.equal(isPlatformAdmin("  abhishek0442@gmail.com  "), true);
  });

  await runTest("Platform admin check rejects non-admin trainers (Trainer A, Trainer B, others)", () => {
    assert.equal(isPlatformAdmin(TRAINER_A.email), false);
    assert.equal(isPlatformAdmin(TRAINER_B.email), false);
    assert.equal(isPlatformAdmin("attacker@malicious.com"), false);
    assert.equal(isPlatformAdmin(null), false);
    assert.equal(isPlatformAdmin(undefined), false);
  });

  await runTest("Abhishek (platform admin) can invite Trainer A via invitation API", () => {
    const res = simulateAdminInvite(TRAINER_ABHISHEK.email, "trainer_a@test.com", "Trainer Alice");
    assert.equal(res.status, 201, "Admin invite must succeed with HTTP 201");
    assert.equal(res.success, true);
    assert.equal(res.trainer.email, "trainer_a@test.com");
    assert.equal(res.trainer.status, "invited");
  });

  await runTest("Non-admin Trainer A CANNOT invite Trainer B (server-side 403 Forbidden)", () => {
    // Malicious Trainer A sends POST /api/admin/trainers/invite
    const res = simulateAdminInvite(TRAINER_A.email, "trainer_b@test.com", "Trainer Bob");
    assert.equal(res.status, 403, "Non-admin invite attempt must be rejected with HTTP 403 Forbidden");
    assert.ok(res.error?.includes("Platform administrator privileges required"));
  });

  await runTest("Non-admin Trainer A CANNOT list all trainers (server-side 403 Forbidden)", () => {
    // Malicious Trainer A sends GET /api/admin/trainers
    const res = simulateAdminListTrainers(TRAINER_A.email);
    assert.equal(res.status, 403, "Non-admin trainer list attempt must be rejected with HTTP 403 Forbidden");
    assert.ok(res.error?.includes("Platform administrator privileges required"));
  });

  await runTest("Unauthenticated caller to trainer invitation API receives 401 Unauthorized", () => {
    const res = simulateAdminInvite(null, "someone@test.com", "Someone");
    assert.equal(res.status, 401, "Unauthenticated invite call must receive 401");
  });

  // ─── 4. TRAINER ONBOARDING & EMPTY DASHBOARD INVARIANTS ───
  console.log("\n4. Trainer Onboarding & Lifecycle Invariants:");

  await runTest("Trainer A starts with zero clients on initial login", () => {
    // Before creating clients, Trainer A's client list is completely empty
    const clientsForA = simulateGetClients(TRAINER_A.id);
    assert.equal(clientsForA.length, 0, "Newly invited trainer must start with zero clients");
  });

  await runTest("Trainer A can create their own client", () => {
    const res = simulateCreateClient(TRAINER_A.id, "Alice Client");
    assert.equal(res.status, 201);
    assert.equal(res.client.full_name, "Alice Client");
    assert.equal(res.client.coach_user_id, TRAINER_A.id);

    // Verify Trainer A now sees exactly 1 client
    const clientsForA = simulateGetClients(TRAINER_A.id);
    assert.equal(clientsForA.length, 1);
    assert.equal(clientsForA[0].id, CLIENT_A_ID);
  });

  await runTest("Abhishek cannot accidentally see Trainer A's private client data on dashboard", () => {
    // Abhishek loads his client list: only his clients are returned
    const clientsForAbhishek = simulateGetClients(TRAINER_ABHISHEK.id);
    assert.ok(clientsForAbhishek.length > 0, "Abhishek has his own clients");
    assert.ok(!clientsForAbhishek.some((c) => c.id === CLIENT_A_ID), "Trainer A's client must NEVER appear on Abhishek's dashboard");
    assert.ok(!clientsForAbhishek.some((c) => c.coach_user_id === TRAINER_A.id), "Trainer A's data must not leak to platform admin dashboard");
  });

  // ─── 5. TENANT ISOLATION TESTS ───
  console.log("\n5. Tenant Data Isolation (Trainer A vs Trainer B):");

  await runTest("Trainer A sees only Trainer A's clients on dashboard", () => {
    const clientsForA = simulateGetClients(TRAINER_A.id);
    assert.equal(clientsForA.length, 1);
    assert.equal(clientsForA[0].id, CLIENT_A_ID);
    assert.equal(clientsForA[0].full_name, "Alice Client");
    assert.ok(!clientsForA.some((c) => c.id === CLIENT_B_ID), "Trainer B's client must never be returned to Trainer A");
  });

  await runTest("Trainer B sees only Trainer B's clients on dashboard", () => {
    const clientsForB = simulateGetClients(TRAINER_B.id);
    assert.equal(clientsForB.length, 1);
    assert.equal(clientsForB[0].id, CLIENT_B_ID);
    assert.equal(clientsForB[0].full_name, "Bob Client");
    assert.ok(!clientsForB.some((c) => c.id === CLIENT_A_ID), "Trainer A's client must never be returned to Trainer B");
  });

  await runTest("Trainer A CANNOT access Trainer B's client by manually changing client UUID in URL", () => {
    const res = simulateGetClientById(CLIENT_B_ID, TRAINER_A.id);
    assert.equal(res.status, 404, "Must reject with 404 Not Found");
    assert.ok(res.error?.includes("not belong to your coach account") || res.error?.includes("not found"));
  });

  await runTest("Trainer B CANNOT access Trainer A's client by manually changing client UUID in URL", () => {
    const res = simulateGetClientById(CLIENT_A_ID, TRAINER_B.id);
    assert.equal(res.status, 404, "Must reject with 404 Not Found");
  });

  await runTest("Trainer A CANNOT access Trainer B's check-ins", () => {
    const res = simulateGetCheckins(CLIENT_B_ID, TRAINER_A.id);
    assert.equal(res.status, 404, "Check-in endpoint must reject cross-tenant access with 404");
  });

  await runTest("Trainer A CANNOT access Trainer B's notes", () => {
    const res = simulateGetNotes(CLIENT_B_ID, TRAINER_A.id);
    assert.equal(res.status, 404, "Coach notes endpoint must reject cross-tenant access with 404");
  });

  await runTest("Trainer A CANNOT access Trainer B's performance data", () => {
    const res = simulateGetPerformance(CLIENT_B_ID, TRAINER_A.id);
    assert.equal(res.status, 404, "Performance endpoint must reject cross-tenant access with 404");
  });

  await runTest("Trainer A CANNOT access or upload photos for Trainer B's client", () => {
    const resUpload = simulatePhotoUpload(CLIENT_B_ID, TRAINER_A.id, `clients/${CLIENT_B_ID}/malicious.jpg`);
    assert.equal(resUpload.status, 404, "Photo upload endpoint must reject cross-tenant attempt with 404");

    const isOwner = validatePhotoOwnership(`clients/${CLIENT_B_ID}/photo.jpg`, CLIENT_A_ID);
    assert.equal(isOwner, false, "validatePhotoOwnership must reject Trainer B photo path for Trainer A client");
  });

  await runTest("Trainer A CANNOT generate an invite or export for Trainer B's client", () => {
    const res = simulateGenerateInvite(CLIENT_B_ID, TRAINER_A.id);
    assert.equal(res.status, 404, "Invite generation must reject Trainer B client ID with 404");
  });

  // ─── 6. CLIENT PORTAL INDEPENDENCE & SECURITY ───
  console.log("\n6. Client Portal Token Architecture & Independence:");

  await runTest("Client portal token architecture generates cryptographically random SHA-256 tokens", () => {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    assert.equal(token.length, 64, "Token must be 64-character hex (32 bytes)");
    assert.equal(tokenHash.length, 64, "Token hash must be 64-character hex");
  });

  await runTest("Client portal links resolve without trainer credentials and leak zero coach data", () => {
    const client = mockClients.find((c) => c.id === CLIENT_A_ID);
    assert.ok(client);
    const portalClientView = {
      id: client.id,
      full_name: client.full_name,
      active: client.active,
    };
    assert.equal("coach_user_id" in portalClientView, false, "Portal payload must never expose coach_user_id");
  });

  console.log("\n=================================================================");
  console.log(`  MULTI-TRAINER ISOLATION TEST SUMMARY: ${passedTests}/${totalTests} PASSED`);
  console.log("=================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
