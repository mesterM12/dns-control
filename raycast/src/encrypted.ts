import { runModeCommand } from "./mode-command";

export default async function command() {
  await runModeCommand(true);
}
