import { Platform } from "../types";
import { arch } from "./arch";
import { darwin } from "./darwin";
import { debian } from "./debian";
import { fedora } from "./fedora";
import type { PlatformInstaller } from "./types";

export const platformInstallers: Record<Platform, PlatformInstaller> = {
  [Platform.Darwin]: darwin,
  [Platform.Debian]: debian,
  [Platform.Fedora]: fedora,
  [Platform.Arch]: arch,
};

export type { NativePackage, PlatformInstaller, PlatformRelease, Release } from "./types";

export { PlatformPreparation, ReleaseKind, ReleasePhase } from "./types";
