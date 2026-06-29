import { CourseProjectConfig } from '@dicodingacademy/code-diffchecker-core';

export interface GlobalOptions {
  json: boolean;
  color: boolean;
}

export interface CacheLocation {
  cacheRoot: string;
  cacheDir: string;
}

export interface FetchedSolution {
  config: CourseProjectConfig;
  cacheDir: string;
}
