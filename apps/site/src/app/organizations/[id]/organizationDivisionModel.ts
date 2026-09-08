import type { Division, DivisionGender } from "@/types";

export type DivisionTypeOption = { id: string; name: string };
export type DivisionTypePayload = {
  genders?: DivisionTypeOption[];
  ages?: DivisionTypeOption[];
  sportSkills?: Array<{ sportId: string; skills: DivisionTypeOption[] }>;
};
export type DivisionSport = { $id: string; name: string };
export type DivisionDraft = {
  name: string;
  sportId: string;
  gender: DivisionGender;
  skillDivisionTypeId: string;
  ageDivisionTypeId: string;
  priceDollars: number;
  maxParticipants: number | null;
  description: string;
  registrationUrl: string;
  status: "ACTIVE" | "INACTIVE";
};

export const emptyDivisionDraft: DivisionDraft = {
  name: "",
  sportId: "",
  gender: "C",
  skillDivisionTypeId: "",
  ageDivisionTypeId: "",
  priceDollars: 0,
  maxParticipants: null,
  description: "",
  registrationUrl: "",
  status: "ACTIVE",
};

export function divisionSkills(types: DivisionTypePayload, sportId: string) {
  return (
    types.sportSkills?.find((entry) => entry.sportId === sportId)?.skills ?? []
  );
}

export function changeDivisionSport(
  draft: DivisionDraft,
  types: DivisionTypePayload,
  sportId: string,
): DivisionDraft {
  return {
    ...draft,
    sportId,
    skillDivisionTypeId: divisionSkills(types, sportId)[0]?.id ?? "",
  };
}

export function newDivisionDraft(
  sports: DivisionSport[],
  types: DivisionTypePayload,
): DivisionDraft {
  return changeDivisionSport(
    {
      ...emptyDivisionDraft,
      ageDivisionTypeId: types.ages?.[0]?.id ?? "",
    },
    types,
    sports[0]?.$id ?? "",
  );
}

export function editDivisionDraft(division: Division): DivisionDraft {
  return {
    name: division.name,
    sportId: division.sportId ?? "",
    gender: division.gender ?? "C",
    skillDivisionTypeId: division.skillDivisionTypeId ?? "",
    ageDivisionTypeId: division.ageDivisionTypeId ?? "",
    priceDollars: (division.price ?? 0) / 100,
    maxParticipants: division.maxParticipants ?? null,
    description: division.description ?? "",
    registrationUrl: division.registrationUrl ?? "",
    status: division.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
  };
}

export function divisionPayload(draft: DivisionDraft) {
  const { priceDollars, ...fields } = draft;
  return { ...fields, price: Math.round(priceDollars * 100) };
}

export function divisionOptions(
  sports: DivisionSport[],
  types: DivisionTypePayload,
  sportId: string,
) {
  const toOption = (option: DivisionTypeOption) => ({
    value: option.id,
    label: option.name,
  });
  return {
    sports: sports.map((sport) => ({ value: sport.$id, label: sport.name })),
    genders: (types.genders ?? []).map(toOption),
    ages: (types.ages ?? []).map(toOption),
    skills: divisionSkills(types, sportId).map(toOption),
  };
}

function requiredOptionName(
  options: DivisionTypeOption[],
  id: string | undefined,
  label: string,
) {
  if (!id) return "Not specified";
  const name = options.find((option) => option.id === id)?.name;
  if (!name?.trim())
    throw new Error(`The division ${label} name is unavailable.`);
  return name;
}

export function divisionLabels(
  division: Division,
  sports: DivisionSport[],
  types: DivisionTypePayload,
) {
  try {
    const labels = {
      sport: requiredOptionName(
        sports.map((sport) => ({ id: sport.$id, name: sport.name })),
        division.sportId,
        "sport",
      ),
      gender: requiredOptionName(
        types.genders ?? [],
        division.gender,
        "gender",
      ),
      age: requiredOptionName(
        types.ages ?? [],
        division.ageDivisionTypeId,
        "age",
      ),
      skill: requiredOptionName(
        divisionSkills(types, division.sportId ?? ""),
        division.skillDivisionTypeId,
        "skill",
      ),
    };
    return { labels, error: null };
  } catch (error) {
    return {
      labels: null,
      error:
        error instanceof Error
          ? error.message
          : "Division details are unavailable.",
    };
  }
}
