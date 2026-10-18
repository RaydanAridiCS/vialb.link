import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export const passwordField = z.string().min(8, "At least 8 characters").max(128, "At most 128 characters");

export const signUpSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(80),
    email: z.email("Enter a valid email"),
    password: passwordField,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

export const forgotSchema = z.object({ email: z.email("Enter a valid email") });

export const resetSchema = z
  .object({ password: passwordField, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Required"), newPassword: passwordField, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: "Passwords do not match" });
