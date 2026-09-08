import { buildUser } from "../../../../test/factories";
import {
  emptyTeamDraft,
  prepareTeamCreation,
  updateTeamDraft,
  type CreateTeamDraft,
} from "../createTeamDraft";

const registrationDraft = (): CreateTeamDraft => ({
  ...emptyTeamDraft(),
  name: " Summit United ",
  sport: "Indoor Volleyball",
  joinPolicy: "OPEN_REGISTRATION",
  divisionGender: "C",
  skillDivisionTypeId: "open",
  ageDivisionTypeId: "18plus",
  registrationPriceDollars: 12.34,
});

describe("team creation preparation", () => {
  it.each([
    ["OPEN_REGISTRATION", true, 1234],
    ["OPEN_REGISTRATION", false, 0],
    ["REQUEST_TO_JOIN", true, 1234],
    ["REQUEST_TO_JOIN", false, 1234],
    ["CLOSED", true, 0],
  ] as const)(
    "keeps the %s price rule with charge access %s",
    (joinPolicy, hasStripeAccount, price) => {
      const result = prepareTeamCreation(
        { ...registrationDraft(), joinPolicy },
        buildUser({ hasStripeAccount }),
      );
      if ("error" in result) throw new Error(result.error);
      expect(result.args[0]).toBe("Summit United");
      expect(result.args[6]).toMatchObject({
        joinPolicy,
        registrationPriceCents: price,
      });
    },
  );

  it("removes internal prices and division requirements for affiliate registration", () => {
    const draft = updateTeamDraft(registrationDraft(), {
      isAffiliateRegistration: true,
      affiliateUrl: " https://club.example/join ",
    });
    const result = prepareTeamCreation(
      draft,
      buildUser({ hasStripeAccount: true }),
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.args[2]).toBe("");
    expect(result.args[6]).toMatchObject({
      affiliateUrl: "https://club.example/join",
      joinPolicy: "OPEN_REGISTRATION",
      registrationPriceCents: 0,
    });
  });

  it("clears registration-only fields when a team becomes closed", () => {
    const draft = updateTeamDraft(registrationDraft(), {
      joinPolicy: "CLOSED",
    });
    expect(draft).toMatchObject({
      divisionGender: "",
      skillDivisionTypeId: "",
      ageDivisionTypeId: "",
      registrationPriceDollars: 0,
    });
    const result = prepareTeamCreation(draft, buildUser());
    if ("error" in result) throw new Error(result.error);
    expect(result.args[2]).toBe("");
    expect(result.args[6]?.divisionTypeId).toBeUndefined();
  });

  it("requires complete divisions for internal registration", () => {
    const draft = { ...registrationDraft(), ageDivisionTypeId: "" };
    expect(prepareTeamCreation(draft, buildUser())).toEqual({
      error: "Select gender, skill division, and age division.",
    });
  });
});
