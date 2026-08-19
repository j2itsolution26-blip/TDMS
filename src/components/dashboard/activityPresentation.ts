export type ActivityTone = "success" | "warning" | "danger" | "info" | "neutral";

const PRESENTATIONS: Record<string, { title: string; tone: ActivityTone }> = {
  LOGIN_SUCCESS: { title: "Signed in", tone: "success" },
  LOGIN_FAILED: { title: "Failed sign-in attempt", tone: "danger" },
  LOGIN_BLOCKED_INACTIVE: { title: "Blocked sign-in — account deactivated", tone: "warning" },
  LOGOUT: { title: "Signed out", tone: "neutral" },
  SUPER_ADMIN_BOOTSTRAPPED: { title: "Super Admin account created", tone: "info" },
  STAFF_ACCOUNT_CREATED: { title: "Staff account created", tone: "success" },
  STAFF_ACCOUNT_UPDATED: { title: "Staff account updated", tone: "info" },
  STAFF_ACCOUNT_ACTIVATED: { title: "Staff account activated", tone: "success" },
  STAFF_ACCOUNT_DEACTIVATED: { title: "Staff account deactivated", tone: "warning" },
  STAFF_PASSWORD_RESET: { title: "Staff password reset", tone: "info" },
  PROGRAM_CREATED: { title: "Program created", tone: "success" },
  PROGRAM_UPDATED: { title: "Program updated", tone: "info" },
};

export function presentAction(action: string): { title: string; tone: ActivityTone } {
  return PRESENTATIONS[action] ?? { title: action.replace(/_/g, " ").toLowerCase(), tone: "neutral" };
}
