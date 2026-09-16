/** @jest-environment node */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { reserveRentalCheckoutWindowLocks, type RentalCheckoutWindow } from "../rentalCheckoutLocks";

const describeDatabase = process.env.RUN_DATABASE_INTEGRATION === "1" ? describe : describe.skip;

describeDatabase("concurrent rental reservations", () => {
  let databaseValidated = false;
  const prefix = `issue-50-${randomUUID()}`;
  const window = (resource: string, event: string, hour = 9): RentalCheckoutWindow => ({
    eventId: `${prefix}-${event}`, fieldIds: [`${prefix}-${resource}`],
    start: new Date(`2027-01-04T${String(hour).padStart(2, "0")}:00:00Z`),
    end: new Date(`2027-01-04T${String(hour + 1).padStart(2, "0")}:00:00Z`),
    timeZone: "UTC", noFixedEndDateTime: false, organizationId: null, eventType: "EVENT", parentEvent: null,
  });
  const reserve = (user: string, windows: RentalCheckoutWindow[]) => reserveRentalCheckoutWindowLocks({
    client: prisma, userId: `${prefix}-${user}`, windows,
  });
  beforeAll(() => {
    const database = new URL(process.env.DATABASE_URL ?? "");
    if (!['localhost', '127.0.0.1'].includes(database.hostname) || database.pathname !== '/bracketiq_e2e_50_samue') {
      throw new Error("Use the isolated issue 50 database.");
    }
    databaseValidated = true;
  });
  afterAll(async () => {
    if (!databaseValidated) return;
    await prisma.lockFiles.deleteMany({ where: { id: { startsWith: `rental-checkout:${prefix}` } } });
    await prisma.$disconnect();
  });
  it("accepts disjoint resources and adjacent windows concurrently", async () => {
    const results = await Promise.all([
      reserve("a", [window("one", "a")]),
      reserve("b", [window("two", "b")]),
      reserve("c", [window("one", "c", 10)]),
    ]);
    expect(results.map((result) => result.ok)).toEqual([true, true, true]);
  });
  it("allows one overlapping owner and replays that owner's hold without duplicates", async () => {
    const attempts = ["race-a", "race-b"];
    const results = await Promise.all(attempts.map((user) => reserve(user, [window("race", user)])));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([expect.objectContaining({ status: 409 })]);
    const index = results.findIndex((result) => result.ok);
    const retry = await reserve(attempts[index], [window("race", attempts[index])]);
    const winner = results[index];
    if (!winner.ok) throw new Error("Expected a successful reservation.");
    expect(retry).toMatchObject({ ok: true, lockIds: winner.lockIds });
    expect(await prisma.lockFiles.count({ where: { id: { startsWith: `rental-checkout:${prefix}-race:` } } })).toBe(1);
  });
  it("rejects a conflicting multi-window replacement without losing existing holds or reserving a subset", async () => {
    expect((await reserve("owner", [window("old", "owner")])).ok).toBe(true);
    expect((await reserve("blocker", [window("blocked", "blocker")])).ok).toBe(true);
    const result = await reserve("owner", [window("free", "owner"), window("blocked", "owner")]);
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(await prisma.lockFiles.count({ where: { id: { startsWith: `rental-checkout:${prefix}-free:` } } })).toBe(0);
    expect(await prisma.lockFiles.count({ where: { id: { startsWith: `rental-checkout:${prefix}-old:` } } })).toBe(1);
  });
});
