import { describe, expect, it } from "vitest";
import {
  academicSectionSchema,
  accountStepSchema,
  householdStepSchema,
  identityStepSchema,
  passwordSchema,
  personalSectionSchema,
  usnSchema,
} from "../student";

describe("passwordSchema", () => {
  it("accepts a password meeting every rule", () => {
    expect(passwordSchema.safeParse("Str0ng!pass").success).toBe(true);
  });

  it.each([
    ["Sh0rt!a", "too short"],
    ["alllowercase1!", "no uppercase"],
    ["ALLUPPERCASE1!", "no lowercase"],
    ["NoDigitsHere!", "no number"],
    ["NoSymbols123", "no symbol"],
  ])("rejects %s (%s)", (password) => {
    expect(passwordSchema.safeParse(password).success).toBe(false);
  });
});

describe("usnSchema", () => {
  it("accepts a valid VTU USN and normalises case", () => {
    const result = usnSchema.safeParse("1hk24cs001");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("1HK24CS001");
  });

  it.each(["1HK24CS01", "HK24CS001", "1HK4CS001", "1HK24C001", ""])(
    "rejects malformed USN %s",
    (usn) => {
      expect(usnSchema.safeParse(usn).success).toBe(false);
    },
  );
});

describe("accountStepSchema", () => {
  const base = {
    email: "student@hkbk.edu.in",
    username: "student_01",
    password: "Str0ng!pass",
    confirmPassword: "Str0ng!pass",
  };

  it("accepts a well-formed account step", () => {
    expect(accountStepSchema.safeParse(base).success).toBe(true);
  });

  it("rejects mismatched passwords and points at the confirm field", () => {
    const result = accountStepSchema.safeParse({
      ...base,
      confirmPassword: "Different1!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["confirmPassword"]);
    }
  });

  it.each(["ab", "Has Spaces", "no-hyphens", "way_too_long_username_here"])(
    "rejects invalid username %s",
    (username) => {
      expect(accountStepSchema.safeParse({ ...base, username }).success).toBe(
        false,
      );
    },
  );

  it("normalises a mixed-case username rather than rejecting it", () => {
    const result = accountStepSchema.safeParse({ ...base, username: "UpperCase" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.username).toBe("uppercase");
  });
});

describe("identityStepSchema", () => {
  const base = {
    fullName: "Aisha Rahman",
    dob: "2006-04-12",
    usn: "1HK24CS001",
    phone: "9880012345",
    state: "Karnataka",
    city: "Bengaluru",
    departmentCode: "CSE",
  };

  it("accepts a well-formed identity step", () => {
    expect(identityStepSchema.safeParse(base).success).toBe(true);
  });

  it.each(["1234567890", "5880012345", "98800123", "98800123456"])(
    "rejects invalid mobile number %s",
    (phone) => {
      expect(identityStepSchema.safeParse({ ...base, phone }).success).toBe(false);
    },
  );

  it("rejects a date of birth that is implausible for a first-year student", () => {
    expect(
      identityStepSchema.safeParse({ ...base, dob: "2020-01-01" }).success,
    ).toBe(false);
  });
});

describe("householdStepSchema", () => {
  const base = {
    guardianName: "Rahman K",
    guardianPhone: "9880012345",
    residenceType: "hostel" as const,
    languageIds: [1, 2],
    consent: true as const,
  };

  it("accepts a well-formed household step", () => {
    expect(householdStepSchema.safeParse(base).success).toBe(true);
  });

  it("refuses to proceed without consent", () => {
    const result = householdStepSchema.safeParse({ ...base, consent: false });
    expect(result.success).toBe(false);
  });

  it("requires at least one language", () => {
    expect(
      householdStepSchema.safeParse({ ...base, languageIds: [] }).success,
    ).toBe(false);
  });
});

describe("academicSectionSchema", () => {
  const base = {
    tenthPercentage: "92.4",
    twelfthPercentage: "88.1",
    quota: "cet",
    entranceRank: "4821",
    semester: "1",
    section: "A",
    admissionYear: String(new Date().getFullYear()),
  };

  it("coerces string form values into numbers", () => {
    const result = academicSectionSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tenthPercentage).toBe(92.4);
      expect(result.data.semester).toBe(1);
    }
  });

  it("treats a blank entrance rank as null rather than an error", () => {
    const result = academicSectionSchema.safeParse({
      ...base,
      quota: "management",
      entranceRank: "",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.entranceRank).toBeNull();
  });

  it("rejects percentages outside 0–100", () => {
    expect(
      academicSectionSchema.safeParse({ ...base, tenthPercentage: "104" }).success,
    ).toBe(false);
  });

  it("rejects a semester outside the first year", () => {
    expect(academicSectionSchema.safeParse({ ...base, semester: "5" }).success).toBe(
      false,
    );
  });

  it("rejects an admission year in the future", () => {
    expect(
      academicSectionSchema.safeParse({
        ...base,
        admissionYear: String(new Date().getFullYear() + 1),
      }).success,
    ).toBe(false);
  });
});

describe("personalSectionSchema", () => {
  const base = {
    fullName: "Aisha Rahman",
    dob: "2006-04-12",
    phone: "9880012345",
    state: "Karnataka",
    city: "Bengaluru",
    guardianName: "Rahman K",
    guardianPhone: "9880054321",
    residenceType: "hostel",
  };

  it("accepts a well-formed personal details section", () => {
    expect(personalSectionSchema.safeParse(base).success).toBe(true);
  });

  it("rejects invalid guardian or student mobile numbers", () => {
    expect(
      personalSectionSchema.safeParse({ ...base, guardianPhone: "12345" }).success,
    ).toBe(false);
    expect(
      personalSectionSchema.safeParse({ ...base, phone: "invalid" }).success,
    ).toBe(false);
  });

  it("rejects invalid residence types", () => {
    expect(
      personalSectionSchema.safeParse({ ...base, residenceType: "dormitory" })
        .success,
    ).toBe(false);
  });

  it("rejects short or empty guardian name", () => {
    expect(
      personalSectionSchema.safeParse({ ...base, guardianName: "A" }).success,
    ).toBe(false);
  });
});

