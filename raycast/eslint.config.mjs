import raycast from "@raycast/eslint-config";

export default [
  ...raycast,
  { ignores: ["dist/**", ".raycast/**", "raycast-env.d.ts"] },
];
