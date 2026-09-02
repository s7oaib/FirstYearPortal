import { z } from "zod";
import { RESIDENCE_VALUES } from "@/config/residence";

/**
 * Shared Zod schemas (ARCHITECTURE 6.1 step 1). The same schema object runs
 * in the browser for instant feedback and again inside the Server Action
 * before anything is written — client validation is a convenience, the
 * server run is the one that counts.
 */

// VTU USN, e.g. 1HK24CS001. HKBK's college code is HK; the year and branch
// vary, and the trailing serial is three digits.
const USN_PATTERN = /^[0-9][A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3}$/;

// Indian mobile: 10 digits starting 6-9. Kept deliberately strict because
// guardian contact is used for real outreach.
const PHONE_PATTERN = /^[6-9][0-9]{9}$/;

const USERNAME_PATTERN = /^[a-z0-9_]{4,20}$/;

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .regex(/[a-z]/, "Include a lowercase letter.")
  .regex(/[A-Z]/, "Include an uppercase letter.")
  .regex(/[0-9]/, "Include a number.")
  .regex(/[^a-zA-Z0-9]/, "Include a symbol.");

export const usnSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(USN_PATTERN, "Enter a valid VTU USN, for example 1HK24CS001.");

export const phoneSchema = z
  .string()
  .trim()
  .regex(PHONE_PATTERN, "Enter a 10-digit Indian mobile number.");

/** Step 1 — account credentials. */
export const accountStepSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        USERNAME_PATTERN,
        "4–20 characters, lowercase letters, numbers and underscores only.",
      ),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

/** Step 2 — identity and contact. */
export const identityStepSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(120, "That name is too long."),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth.")
    .refine((value) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return false;
      const age =
        (Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return age >= 15 && age <= 60;
    }, "Date of birth looks incorrect for a first-year student."),
  usn: usnSchema,
  phone: phoneSchema,
  state: z.string().trim().min(2, "Enter your state."),
  city: z.string().trim().min(2, "Enter your city or town."),
  departmentCode: z.string().trim().min(2, "Select your department."),
});

/** Step 3 — guardian, languages, accommodation, consent. */
export const householdStepSchema = z.object({
  guardianName: z.string().trim().min(2, "Enter your parent or guardian's name."),
  guardianPhone: phoneSchema,
  residenceType: z.enum(RESIDENCE_VALUES, {
    errorMap: () => ({ message: "Select where you live during term." }),
  }),
  languageIds: z
    .array(z.number().int().positive())
    .min(1, "Select at least one language you know."),
  consent: z.literal(true, {
    errorMap: () => ({
      message: "You must agree to the privacy notice to create an account.",
    }),
  }),
});

export const registrationSchema = accountStepSchema
  .innerType()
  .merge(identityStepSchema)
  .merge(householdStepSchema)
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export type AccountStepValues = z.infer<typeof accountStepSchema>;
export type IdentityStepValues = z.infer<typeof identityStepSchema>;
export type HouseholdStepValues = z.infer<typeof householdStepSchema>;
export type RegistrationValues = z.infer<typeof registrationSchema>;

// --- Profile completion sections -------------------------------------------

export const personalSectionSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(120, "That name is too long."),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth.")
    .refine((value) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return false;
      const age =
        (Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return age >= 15 && age <= 60;
    }, "Date of birth looks incorrect for a first-year student."),
  phone: phoneSchema,
  state: z.string().trim().min(2, "Enter your state."),
  city: z.string().trim().min(2, "Enter your city or town."),
  guardianName: z.string().trim().min(2, "Enter your parent or guardian's name."),
  guardianPhone: phoneSchema,
  residenceType: z.enum(RESIDENCE_VALUES, {
    errorMap: () => ({ message: "Select where you live during term." }),
  }),
});

const percentage = z.coerce
  .number({ invalid_type_error: "Enter a percentage." })
  .min(0, "Cannot be below 0.")
  .max(100, "Cannot be above 100.");

export const academicSectionSchema = z.object({
  tenthPercentage: percentage,
  twelfthPercentage: percentage,
  quota: z.enum(["cet", "comedk", "management", "jee", "diploma_lateral", "other"], {
    errorMap: () => ({ message: "Select your admission quota." }),
  }),
  // Optional by design: management-quota students have no entrance rank, and
  // requiring one would make their profile impossible to complete.
  //
  // The empty check must happen *before* coercion — `z.coerce.number()` turns
  // "" into 0, which passes `min(0)` and would silently record a real rank of
  // zero for every student who left the field blank.
  entranceRank: z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined ? null : value,
    z.coerce
      .number({ invalid_type_error: "Enter a number." })
      .int("Enter a whole number.")
      .min(0, "Rank cannot be negative.")
      .nullable(),
  ),
  semester: z.coerce
    .number()
    .int()
    .min(1, "Select your semester.")
    .max(2, "First-year students are in semester 1 or 2."),
  section: z
    .string()
    .trim()
    .min(1, "Enter your section.")
    .max(4, "Section should be short, e.g. A."),
  admissionYear: z.coerce
    .number()
    .int()
    .min(2000, "Enter a valid admission year.")
    .max(new Date().getFullYear(), "Admission year cannot be in the future."),
});

/** Interests, goals, and domains all share the same many-to-many shape. */
export const selectionSectionSchema = z.object({
  ids: z
    .array(z.coerce.number().int().positive())
    .min(1, "Select at least one option."),
});

export type PersonalSectionValues = z.infer<typeof personalSectionSchema>;
export type AcademicSectionValues = z.infer<typeof academicSectionSchema>;
export type SelectionSectionValues = z.infer<typeof selectionSectionSchema>;

