"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthActionResult = {
  error?: string;
  success?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function validateEmail(email: string): string | null {
  if (!email) {
    return "Email is required.";
  }
  if (!EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address.";
  }
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) {
    return "Password is required.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/**
 * Signs in with email and password. On success, redirects to "/".
 * Returns a safe error message on failure (never exposes tokens).
 */
export async function signIn(formData: FormData): Promise<AuthActionResult> {
  const email = getStringField(formData, "email");
  const password =
    typeof formData.get("password") === "string"
      ? (formData.get("password") as string)
      : "";

  const emailError = validateEmail(email);
  if (emailError) {
    return { error: emailError };
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return { error: passwordError };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Invalid email or password." };
  }

  redirect("/");
}

/**
 * Creates an account with email and password.
 *
 * Hosted Supabase projects may require email confirmation, so a session is
 * not assumed after signup. When confirmation is required, returns a success
 * message asking the user to check their email.
 */
export async function signUp(formData: FormData): Promise<AuthActionResult> {
  const email = getStringField(formData, "email");
  const password =
    typeof formData.get("password") === "string"
      ? (formData.get("password") as string)
      : "";
  const confirmPassword =
    typeof formData.get("confirmPassword") === "string"
      ? (formData.get("confirmPassword") as string)
      : "";

  const emailError = validateEmail(email);
  if (emailError) {
    return { error: emailError };
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return { error: passwordError };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: "http://localhost:3000/auth/callback",
    },
  });

  if (error) {
    return {
      error: "Unable to create account. Please try again.",
    };
  }

  // Session present means email confirmation is off or already satisfied.
  if (data.session) {
    redirect("/");
  }

  return {
    success:
      "Account created. Check your email to confirm your address before signing in.",
  };
}

/**
 * Signs out the current user and redirects to the login page.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
