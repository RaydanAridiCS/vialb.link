import type { IUserRepository } from "@/server/repositories/user.repository";
import type { SettingsService } from "./settings.service";

export interface AdminGateDeps {
  settings: SettingsService;
  users: IUserRepository;
  /** `ADMIN_2FA_EMERGENCY_OFF`: ignores the setting entirely, for an admin who locked themselves out. */
  emergencyOff: boolean;
}

/** The part of a session the gate needs. */
export interface GateUser {
  id: string;
  role?: string | null;
  twoFactorEnabled?: boolean | null;
}

/**
 * Decides whether an administrator must set up two-factor authentication before using the admin area.
 *
 * Deliberately narrow so it cannot lock anyone out for good: it only ever applies to administrators, only when the
 * setting is on and the emergency switch is off, and not to administrators who have no password (they sign in with a
 * social provider, and Better Auth can only enrol an authenticator app for people who have one). Their normal
 * dashboard is never blocked, only the admin area.
 */
export class AdminGateService {
  constructor(private readonly deps: AdminGateDeps) {}

  get emergencyOff(): boolean {
    return this.deps.emergencyOff;
  }

  /** Whether the setting is in force right now. */
  async isRequired(): Promise<boolean> {
    if (this.deps.emergencyOff) return false;
    return (await this.deps.settings.get()).requireAdmin2fa;
  }

  /** True when this person is an administrator who has to enrol before continuing. */
  async mustEnroll(user: GateUser): Promise<boolean> {
    if (user.role !== "admin" || user.twoFactorEnabled === true) return false;
    if (!(await this.isRequired())) return false;
    return this.deps.users.hasPassword(user.id);
  }
}
