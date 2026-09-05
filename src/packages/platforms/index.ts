import type { Platform } from "../types";
import { arch } from "./arch";
import { darwin } from "./darwin";
import { debian } from "./debian";
import { fedora } from "./fedora";
import type { PlatformInstaller } from "./types";

export const platformInstallers: Record<Platform, PlatformInstaller> = {
  darwin,
  debian,
  fedora,
  arch,
};

export type { NativePackage, PlatformInstaller, PlatformRelease, Release } from "./types";
