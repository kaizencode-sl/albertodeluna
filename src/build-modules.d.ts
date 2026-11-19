// Build-time only libraries without their own types (used by the seal)
declare module "fontkit" {
  export function create(buffer: Uint8Array): unknown
}
