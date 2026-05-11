const readRequiredEnv = (key: keyof ImportMetaEnv) => {
  const value = import.meta.env[key];

  if (!value) {
    throw new Error(`${key} is not defined`);
  }

  return value;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const API_URL = trimTrailingSlash(readRequiredEnv("VITE_API_URL"));
export const SOCKET_URL = trimTrailingSlash(readRequiredEnv("VITE_SOCKET_URL"));
export const CLOUDFRONT_DOMAIN = readRequiredEnv("VITE_CLOUDFRONT_DOMAIN");
